extern crate proc_macro;
use proc_macro::TokenStream;

/// Test-only pass-through; this stub never registers an IPC command.
#[proc_macro_attribute]
pub fn command(_attr: TokenStream, item: TokenStream) -> TokenStream { item }
