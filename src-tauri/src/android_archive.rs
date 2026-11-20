//! Android Keystore-wrapped archive data key. No key or path crosses IPC.
//! The non-exportable Android AES key wraps a random XChaCha archive key.
use crate::archive_keys::{Key, KeyError, KeyStore, KEY_LEN};
use crate::chart_archive::{self, ArchivePaths, ArchiveRequestV1, ArchiveResponseV1};
use jni::{JNIEnv, JavaVM, objects::{JByteArray, JObject, JString, JValue}};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use zeroize::{Zeroize, Zeroizing};

const ALIAS: &str = "it.virgostars.mobile.archive.wrap.v1";
const MAGIC: &[u8;8] = b"VSKEY01\0";
const IV_LEN: usize = 12;
const WRAPPED_LEN: usize = KEY_LEN + 16;
const ENVELOPE_LEN: usize = MAGIC.len() + IV_LEN + WRAPPED_LEN;

pub(crate) fn with_jni<T>(action: impl FnOnce(&mut JNIEnv<'_>) -> jni::errors::Result<T>) -> Result<T, KeyError> {
    let context = std::panic::catch_unwind(ndk_context::android_context).map_err(|_| KeyError::Unavailable)?;
    // The Android runtime initializes and owns the VM for the process lifetime.
    let vm = unsafe { JavaVM::from_raw(context.vm().cast()) }.map_err(|_| KeyError::Unavailable)?;
    let mut env = vm.attach_current_thread().map_err(|_| KeyError::Unavailable)?;
    let result = action(&mut env);
    if env.exception_check().unwrap_or(false) { let _ = env.exception_clear(); }
    result.map_err(|_| KeyError::Unavailable)
}

pub(crate) fn no_backup_folder() -> Result<PathBuf, KeyError> {
    with_jni(|env| {
        // ndk-context's Activity is a runtime-owned global reference; do not release it.
        let activity = unsafe { JObject::from_raw(ndk_context::android_context().context().cast()) };
        let folder = env.call_method(&activity, "getNoBackupFilesDir", "()Ljava/io/File;", &[])?.l()?;
        let path = JString::from(env.call_method(folder, "getAbsolutePath", "()Ljava/lang/String;", &[])?.l()?);
        let value:String = env.get_string(&path)?.into();
        Ok(PathBuf::from(value).join("virgostars-archive-v1"))
    })
}

fn android_store<'a>(env:&mut JNIEnv<'a>) -> jni::errors::Result<JObject<'a>> {
    let name=env.new_string("AndroidKeyStore")?;
    let store=env.call_static_method("java/security/KeyStore","getInstance","(Ljava/lang/String;)Ljava/security/KeyStore;",&[JValue::Object(name.as_ref())])?.l()?;
    env.call_method(&store,"load","(Ljava/security/KeyStore$LoadStoreParameter;)V",&[JValue::Object(&JObject::null())])?;
    Ok(store)
}

fn existing_key<'a>(env:&mut JNIEnv<'a>, store:&JObject<'a>) -> jni::errors::Result<JObject<'a>> {
    let alias=env.new_string(ALIAS)?;
    env.call_method(store,"getKey","(Ljava/lang/String;[C)Ljava/security/Key;",&[JValue::Object(alias.as_ref()),JValue::Object(&JObject::null())])?.l()
}

fn create_wrapping_key<'a>(env:&mut JNIEnv<'a>) -> jni::errors::Result<JObject<'a>> {
    let algorithm=env.new_string("AES")?; let provider=env.new_string("AndroidKeyStore")?;
    let generator=env.call_static_method("javax/crypto/KeyGenerator","getInstance","(Ljava/lang/String;Ljava/lang/String;)Ljavax/crypto/KeyGenerator;",&[JValue::Object(algorithm.as_ref()),JValue::Object(provider.as_ref())])?.l()?;
    let alias=env.new_string(ALIAS)?;
    let builder=env.new_object("android/security/keystore/KeyGenParameterSpec$Builder","(Ljava/lang/String;I)V",&[JValue::Object(alias.as_ref()),JValue::Int(3)])?;
    let modes=env.new_object_array(1,"java/lang/String",JObject::null())?; let gcm=env.new_string("GCM")?; env.set_object_array_element(&modes,0,&gcm)?;
    env.call_method(&builder,"setBlockModes","([Ljava/lang/String;)Landroid/security/keystore/KeyGenParameterSpec$Builder;",&[JValue::Object(modes.as_ref())])?;
    let pads=env.new_object_array(1,"java/lang/String",JObject::null())?; let padding=env.new_string("NoPadding")?; env.set_object_array_element(&pads,0,&padding)?;
    env.call_method(&builder,"setEncryptionPaddings","([Ljava/lang/String;)Landroid/security/keystore/KeyGenParameterSpec$Builder;",&[JValue::Object(pads.as_ref())])?;
    env.call_method(&builder,"setKeySize","(I)Landroid/security/keystore/KeyGenParameterSpec$Builder;",&[JValue::Int(256)])?;
    let spec=env.call_method(&builder,"build","()Landroid/security/keystore/KeyGenParameterSpec;",&[])?.l()?;
    env.call_method(&generator,"init","(Ljava/security/spec/AlgorithmParameterSpec;)V",&[JValue::Object(&spec)])?;
    env.call_method(&generator,"generateKey","()Ljavax/crypto/SecretKey;",&[])?.l()
}

fn cipher<'a>(env:&mut JNIEnv<'a>) -> jni::errors::Result<JObject<'a>> {
    let transformation=env.new_string("AES/GCM/NoPadding")?;
    env.call_static_method("javax/crypto/Cipher","getInstance","(Ljava/lang/String;)Ljavax/crypto/Cipher;",&[JValue::Object(transformation.as_ref())])?.l()
}

fn wrap(key:&Key) -> Result<Vec<u8>,KeyError> {
    with_jni(|env| {
        let store=android_store(env)?;
        let mut wrapping=existing_key(env,&store)?;
        if wrapping.is_null() { wrapping=create_wrapping_key(env)?; }
        let cipher=cipher(env)?;
        env.call_method(&cipher,"init","(ILjava/security/Key;)V",&[JValue::Int(1),JValue::Object(&wrapping)])?;
        let aad=env.byte_array_from_slice(MAGIC)?;
        env.call_method(&cipher,"updateAAD","([B)V",&[JValue::Object(aad.as_ref())])?;
        let input=env.byte_array_from_slice(&key[..])?;
        let encrypted=env.call_method(&cipher,"doFinal","([B)[B",&[JValue::Object(input.as_ref())]);
        if encrypted.is_err() && env.exception_check().unwrap_or(false) { let _=env.exception_clear(); }
        let wiped=env.set_byte_array_region(&input,0,&[0i8;KEY_LEN]);
        let encrypted=encrypted?.l()?; wiped?;
        let iv=JByteArray::from(env.call_method(&cipher,"getIV","()[B",&[])?.l()?);
        let iv=env.convert_byte_array(iv)?;
        let ciphertext=env.convert_byte_array(JByteArray::from(encrypted))?;
        let mut out=Vec::with_capacity(ENVELOPE_LEN); out.extend_from_slice(MAGIC); out.extend_from_slice(&iv); out.extend_from_slice(&ciphertext);
        Ok(out)
    }).and_then(|data| if data.len()==ENVELOPE_LEN {Ok(data)} else {Err(KeyError::Unavailable)})
}

fn unwrap_key(data:&[u8]) -> Result<Key,KeyError> {
    if data.len()!=ENVELOPE_LEN || &data[..MAGIC.len()]!=MAGIC { return Err(KeyError::Unavailable); }
    with_jni(|env| {
        let store=android_store(env)?; let wrapping=existing_key(env,&store)?;
        if wrapping.is_null() { return Err(jni::errors::Error::NullPtr("missing Android Keystore key")); }
        let iv=env.byte_array_from_slice(&data[MAGIC.len()..MAGIC.len()+IV_LEN])?;
        let spec=env.new_object("javax/crypto/spec/GCMParameterSpec","(I[B)V",&[JValue::Int(128),JValue::Object(iv.as_ref())])?;
        let cipher=cipher(env)?;
        env.call_method(&cipher,"init","(ILjava/security/Key;Ljava/security/spec/AlgorithmParameterSpec;)V",&[JValue::Int(2),JValue::Object(&wrapping),JValue::Object(&spec)])?;
        let aad=env.byte_array_from_slice(MAGIC)?; env.call_method(&cipher,"updateAAD","([B)V",&[JValue::Object(aad.as_ref())])?;
        let wrapped=env.byte_array_from_slice(&data[MAGIC.len()+IV_LEN..])?;
        let result=JByteArray::from(env.call_method(&cipher,"doFinal","([B)[B",&[JValue::Object(wrapped.as_ref())])?.l()?);
        let mut plain=Zeroizing::new(env.convert_byte_array(&result)?);
        if plain.len()!=KEY_LEN { plain.zeroize(); return Err(jni::errors::Error::NullPtr("invalid wrapped key")); }
        let mut key:Key=Zeroizing::new([0u8;KEY_LEN]); key.copy_from_slice(&plain);
        env.set_byte_array_region(&result,0,&[0i8;KEY_LEN])?;
        Ok(key)
    })
}

pub(crate) struct AndroidKeyStore { folder:PathBuf }
impl AndroidKeyStore { pub(crate) fn new(folder:&Path)->Self { Self{folder:folder.to_path_buf()} } }
impl KeyStore for AndroidKeyStore {
    fn load(&self)->Result<Option<Key>,KeyError> {
        let path=self.folder.join("archive-key.v1");
        let file=match fs::File::open(path) { Ok(f)=>f, Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(None), Err(_)=>return Err(KeyError::Unavailable) };
        use std::io::Read;
        let mut data=Vec::new(); file.take((ENVELOPE_LEN+1) as u64).read_to_end(&mut data).map_err(|_|KeyError::Unavailable)?;
        unwrap_key(&data).map(Some)
    }
    fn store(&self,key:&Key)->Result<(),KeyError> {
        fs::create_dir_all(&self.folder).map_err(|_|KeyError::Unavailable)?;
        let target=self.folder.join("archive-key.v1"); let staging=self.folder.join("archive-key.v1.tmp");
        if target.exists() { return Err(KeyError::Unavailable); }
        let envelope=wrap(key)?;
        match fs::remove_file(&staging) {Ok(())=>(),Err(e) if e.kind()==std::io::ErrorKind::NotFound=>(),Err(_)=>return Err(KeyError::Unavailable)}
        let result=(||->std::io::Result<()> { let mut f=OpenOptions::new().write(true).create_new(true).open(&staging)?; f.write_all(&envelope)?; f.sync_all()?; fs::rename(&staging,&target)?; Ok(()) })();
        if result.is_err() { let _=fs::remove_file(&staging); }
        result.map_err(|_|KeyError::Unavailable)
    }
}

#[tauri::command]
pub async fn chart_archive(request:ArchiveRequestV1)->ArchiveResponseV1 {
    let failure=|| chart_archive::unavailable();
    let Ok(folder)=no_backup_folder() else { return failure(); };
    let Ok(duration)=SystemTime::now().duration_since(UNIX_EPOCH) else { return failure(); };
    let Ok(now)=i64::try_from(duration.as_millis()) else { return failure(); };
    chart_archive::handle(&ArchivePaths::mobile(&folder),&AndroidKeyStore::new(&folder),&request,now)
}

#[tauri::command]
pub async fn startup_preference(request:crate::startup_preference::Request)->crate::startup_preference::Response {
    match no_backup_folder() {
        Ok(folder)=>crate::startup_preference::handle(&folder,request),
        Err(_)=>crate::startup_preference::Response{protocol_version:1,status:"unavailable",preference:None},
    }
}

#[tauri::command]
pub async fn device_preferences(request:crate::device_preferences::Request)->crate::device_preferences::Response {
    match no_backup_folder() {Ok(folder)=>crate::device_preferences::handle(&folder,request),Err(_)=>crate::device_preferences::unavailable()}
}
