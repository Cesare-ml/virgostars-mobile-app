//! Retrieve the current Activity through the app's class loader. Tao initializes
//! ndk-context with the Application, not an Activity; never cast it as one.
use crate::archive_keys::KeyError;
use jni::{
    objects::{JClass, JObject, JValue},
    JNIEnv,
};

pub(crate) fn with_activity<T>(
    action: impl for<'local> FnOnce(&mut JNIEnv<'local>, JObject<'local>) -> jni::errors::Result<T>,
) -> Result<T, KeyError> {
    crate::android_archive::with_jni(|env| {
        // ndk-context supplies a runtime-owned global Application reference.
        let application =
            unsafe { JObject::from_raw(ndk_context::android_context().context().cast()) };
        let loader = env
            .call_method(
                &application,
                "getClassLoader",
                "()Ljava/lang/ClassLoader;",
                &[],
            )?
            .l()?;
        let name = env.new_string("it.virgostars.mobile.MainActivity")?;
        let class = JClass::from(
            env.call_method(
                &loader,
                "loadClass",
                "(Ljava/lang/String;)Ljava/lang/Class;",
                &[JValue::Object(name.as_ref())],
            )?
            .l()?,
        );
        let activity = env
            .call_static_method(
                class,
                "getVirgoActivity",
                "()Lit/virgostars/mobile/MainActivity;",
                &[],
            )?
            .l()?;
        if activity.is_null() {
            return Err(jni::errors::Error::NullPtr("activity unavailable"));
        }
        action(env, activity)
    })
}
