import {invoke,isTauri} from '@tauri-apps/api/core';
import {requestAccount,type AccountOperation,type AccountResult} from './account-contract';

export function accountOperation(operation:AccountOperation):Promise<AccountResult> {
  return requestAccount({isNative:isTauri,invoke:(name,args)=>invoke<unknown>(name,args as Record<string,unknown>)},operation);
}
