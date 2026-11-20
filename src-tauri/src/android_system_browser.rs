//! Android ACTION_VIEW browser dispatch, used only by the experimental native
//! coordinator. No URL is sent to JavaScript. No Tauri command registers it.
use crate::android_login_coordinator::SystemBrowser;
use jni::objects::{JObject, JValue};
use url::Url;

pub(crate) struct AndroidSystemBrowser;
impl SystemBrowser for AndroidSystemBrowser {
    fn open(&self, url: &str) -> Result<(), ()> {
        let parsed = Url::parse(url).map_err(|_| ())?;
        if url.len() > 4096
            || parsed.scheme() != "https"
            || parsed.host_str().is_none()
            || !parsed.username().is_empty()
            || parsed.password().is_some()
        {
            return Err(());
        }
        crate::android_archive::with_jni(|env| {
            // Runtime-owned Activity global reference, not a new local reference.
            let activity =
                unsafe { JObject::from_raw(ndk_context::android_context().context().cast()) };
            let action = env.new_string("android.intent.action.VIEW")?;
            let target = env.new_string(url)?;
            let uri = env
                .call_static_method(
                    "android/net/Uri",
                    "parse",
                    "(Ljava/lang/String;)Landroid/net/Uri;",
                    &[JValue::Object(target.as_ref())],
                )?
                .l()?;
            let intent = env.new_object(
                "android/content/Intent",
                "(Ljava/lang/String;Landroid/net/Uri;)V",
                &[JValue::Object(action.as_ref()), JValue::Object(&uri)],
            )?;
            let category = env.new_string("android.intent.category.BROWSABLE")?;
            env.call_method(
                &intent,
                "addCategory",
                "(Ljava/lang/String;)Landroid/content/Intent;",
                &[JValue::Object(category.as_ref())],
            )?;
            // Resolve to a browser activity instead of any HTTPS app handler.
            let main = env.new_string("android.intent.action.MAIN")?;
            let selector = env.new_object(
                "android/content/Intent",
                "(Ljava/lang/String;)V",
                &[JValue::Object(main.as_ref())],
            )?;
            let browser = env.new_string("android.intent.category.APP_BROWSER")?;
            env.call_method(
                &selector,
                "addCategory",
                "(Ljava/lang/String;)Landroid/content/Intent;",
                &[JValue::Object(browser.as_ref())],
            )?;
            env.call_method(
                &intent,
                "setSelector",
                "(Landroid/content/Intent;)V",
                &[JValue::Object(&selector)],
            )?;
            env.call_method(
                &activity,
                "startActivity",
                "(Landroid/content/Intent;)V",
                &[JValue::Object(&intent)],
            )?;
            Ok(())
        })
        .map_err(|_| ())
    }
}
