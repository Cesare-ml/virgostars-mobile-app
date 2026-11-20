//! The sealed container of the chart archive: one file that holds an entire SQLite database
//! encrypted and authenticated with XChaCha20-Poly1305 (RustCrypto).
//!
//! ```text
//! "VSARCHV\0" (8) | format version (1) | random nonce (24) | ciphertext + 16-byte tag
//! ```
//!
//! The header is authenticated as associated data, so a changed version or magic fails. Every write
//! uses a fresh random 192-bit nonce, which is safe to draw at random for this cipher. Nothing but
//! this ciphertext is written to disk: no plain page, journal or temporary copy.
use crate::archive_keys::{Key, KeyError};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{Key as CipherKey, XChaCha20Poly1305, XNonce};
use zeroize::Zeroizing;

pub const MAGIC: &[u8; 8] = b"VSARCHV\0";
pub const FORMAT_VERSION: u8 = 1;
const HEADER_LEN: usize = MAGIC.len() + 1;
const NONCE_LEN: usize = 24;
const TAG_LEN: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VaultError {
    /// Not a sealed archive of this application (too short, other magic, unknown old version).
    NotAnArchive,
    /// Written by a newer application: never opened with old rules.
    Newer,
    /// Wrong key, or the file was altered: indistinguishable by design.
    Authentication,
}

fn header(version: u8) -> [u8; HEADER_LEN] {
    let mut bytes = [0u8; HEADER_LEN];
    bytes[..MAGIC.len()].copy_from_slice(MAGIC);
    bytes[MAGIC.len()] = version;
    bytes
}

/// Encrypts `plaintext` for the current format version.
pub fn seal(key: &Key, plaintext: &[u8]) -> Result<Vec<u8>, KeyError> {
    let mut nonce = [0u8; NONCE_LEN];
    getrandom::fill(&mut nonce).map_err(|_| KeyError::Unavailable)?;
    let head = header(FORMAT_VERSION);
    let cipher = XChaCha20Poly1305::new(CipherKey::from_slice(&key[..]));
    let ciphertext = cipher
        .encrypt(XNonce::from_slice(&nonce), Payload { msg: plaintext, aad: &head })
        .map_err(|_| KeyError::Unavailable)?;
    let mut sealed = Vec::with_capacity(HEADER_LEN + NONCE_LEN + ciphertext.len());
    sealed.extend_from_slice(&head);
    sealed.extend_from_slice(&nonce);
    sealed.extend_from_slice(&ciphertext);
    Ok(sealed)
}

/// Decrypts a sealed archive. The plaintext is wiped from memory when dropped.
pub fn open(key: &Key, sealed: &[u8]) -> Result<Zeroizing<Vec<u8>>, VaultError> {
    if sealed.len() < HEADER_LEN + NONCE_LEN + TAG_LEN || &sealed[..MAGIC.len()] != MAGIC {
        return Err(VaultError::NotAnArchive);
    }
    let version = sealed[MAGIC.len()];
    if version > FORMAT_VERSION {
        return Err(VaultError::Newer);
    }
    if version < FORMAT_VERSION {
        return Err(VaultError::NotAnArchive);
    }
    let nonce = &sealed[HEADER_LEN..HEADER_LEN + NONCE_LEN];
    let cipher = XChaCha20Poly1305::new(CipherKey::from_slice(&key[..]));
    cipher
        .decrypt(XNonce::from_slice(nonce), Payload { msg: &sealed[HEADER_LEN + NONCE_LEN..], aad: &sealed[..HEADER_LEN] })
        .map(Zeroizing::new)
        .map_err(|_| VaultError::Authentication)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::archive_keys::new_key;

    #[test]
    fn test_a_sealed_archive_opens_with_its_key_and_holds_no_plain_text() {
        let key = new_key().unwrap();
        let secret = b"Soggetto di prova, nato in un luogo di prova";
        let sealed = seal(&key, secret).unwrap();
        assert_eq!(&sealed[..MAGIC.len()], MAGIC);
        assert!(!sealed.windows(secret.len()).any(|window| window == secret));
        assert_eq!(&**open(&key, &sealed).unwrap(), secret);
        assert_eq!(sealed.len(), HEADER_LEN + NONCE_LEN + secret.len() + TAG_LEN);
    }

    #[test]
    fn test_every_seal_uses_a_new_nonce() {
        let key = new_key().unwrap();
        let first = seal(&key, b"stesso testo").unwrap();
        let second = seal(&key, b"stesso testo").unwrap();
        assert_ne!(first[HEADER_LEN..HEADER_LEN + NONCE_LEN], second[HEADER_LEN..HEADER_LEN + NONCE_LEN]);
        assert_ne!(first, second);
    }

    #[test]
    fn test_a_wrong_key_or_any_changed_byte_fails_authentication() {
        let key = new_key().unwrap();
        let sealed = seal(&key, b"dati di prova").unwrap();
        assert_eq!(open(&new_key().unwrap(), &sealed).err(), Some(VaultError::Authentication));
        // Nonce, ciphertext and tag: every position after the header.
        for index in HEADER_LEN..sealed.len() {
            let mut changed = sealed.clone();
            changed[index] ^= 0x01;
            assert_eq!(open(&key, &changed).err(), Some(VaultError::Authentication), "byte {index}");
        }
    }

    #[test]
    fn test_the_header_is_authenticated_too() {
        let key = new_key().unwrap();
        let mut sealed = seal(&key, b"dati di prova").unwrap();
        // Same version number, different magic: not ours.
        sealed[0] ^= 0xFF;
        assert_eq!(open(&key, &sealed).err(), Some(VaultError::NotAnArchive));
    }

    #[test]
    fn test_short_foreign_and_newer_files_are_told_apart() {
        let key = new_key().unwrap();
        let sealed = seal(&key, b"dati di prova").unwrap();
        assert_eq!(open(&key, &[]).err(), Some(VaultError::NotAnArchive));
        assert_eq!(open(&key, &sealed[..HEADER_LEN + NONCE_LEN]).err(), Some(VaultError::NotAnArchive));
        assert_eq!(open(&key, &b"SQLite format 3\0".repeat(20)).err(), Some(VaultError::NotAnArchive));
        let mut newer = sealed.clone();
        newer[MAGIC.len()] = FORMAT_VERSION + 1;
        assert_eq!(open(&key, &newer).err(), Some(VaultError::Newer));
        let mut older = sealed;
        older[MAGIC.len()] = 0;
        assert_eq!(open(&key, &older).err(), Some(VaultError::NotAnArchive));
    }
}
