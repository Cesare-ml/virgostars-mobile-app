//! Archive key boundary; the Android implementation wraps the random key with Android Keystore.
//!
//! The target design uses 256 random bits protected by a device credential store.
//! It is never derived from a device identifier, never written to a file or to WebView storage, and
//! never sent to the WebView. If the store is locked or unavailable the archive stays locked: there
//! is no fallback to plain text.
//!
//! The in-memory fake store is for tests only. Android's Keystore port is separate; iOS is not wired.
use zeroize::Zeroizing;

pub const KEY_LEN: usize = 32;
/// Wiped from memory when dropped.
pub type Key = Zeroizing<[u8; KEY_LEN]>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyError {
    /// The credential store cannot be reached or refused the request.
    Unavailable,
}

/// Port to the platform credential store, so the archive logic is tested with a fake one.
pub trait KeyStore {
    /// `Ok(None)` only when the store works and holds no archive key yet.
    fn load(&self) -> Result<Option<Key>, KeyError>;
    fn store(&self, key: &Key) -> Result<(), KeyError>;
}

/// A fresh random key from the operating system's generator.
pub fn new_key() -> Result<Key, KeyError> {
    let mut key: Key = Zeroizing::new([0u8; KEY_LEN]);
    getrandom::fill(&mut key[..]).map_err(|_| KeyError::Unavailable)?;
    Ok(key)
}

#[cfg(test)]
pub mod fake {
    use super::*;
    use std::cell::RefCell;

    /// An in-memory key store whose behaviour tests can change.
    pub struct FakeKeyStore {
        pub key: RefCell<Option<[u8; KEY_LEN]>>,
        pub unavailable: RefCell<bool>,
    }

    impl FakeKeyStore {
        pub fn empty() -> Self {
            Self { key: RefCell::new(None), unavailable: RefCell::new(false) }
        }
    }

    impl KeyStore for FakeKeyStore {
        fn load(&self) -> Result<Option<Key>, KeyError> {
            if *self.unavailable.borrow() {
                return Err(KeyError::Unavailable);
            }
            Ok(self.key.borrow().map(Zeroizing::new))
        }
        fn store(&self, key: &Key) -> Result<(), KeyError> {
            if *self.unavailable.borrow() {
                return Err(KeyError::Unavailable);
            }
            *self.key.borrow_mut() = Some(**key);
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_keys_are_random_and_full_length() {
        let first = new_key().unwrap();
        let second = new_key().unwrap();
        assert_eq!(first.len(), KEY_LEN);
        assert_ne!(*first, *second);
        assert_ne!(*first, [0u8; KEY_LEN]);
    }

    #[test]
    fn test_the_fake_store_models_missing_present_and_unavailable() {
        let store = fake::FakeKeyStore::empty();
        assert!(store.load().unwrap().is_none());
        let key = new_key().unwrap();
        store.store(&key).unwrap();
        assert_eq!(*store.load().unwrap().unwrap(), *key);
        *store.unavailable.borrow_mut() = true;
        assert_eq!(store.load().err(), Some(KeyError::Unavailable));
        assert_eq!(store.store(&key).err(), Some(KeyError::Unavailable));
    }
}
