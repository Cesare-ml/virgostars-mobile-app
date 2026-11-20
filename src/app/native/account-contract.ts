/** Account commands never accept a URL, code, token or user-supplied identity. */
export type AccountOperation = 'status' | 'begin' | 'sync' | 'close';
export type AccountStatus = 'idle' | 'pending' | 'connected' | 'synced';
export type AccountFailure = 'unavailable' | 'busy' | 'denied' | 'authorization' | 'network' | 'cache' | 'invalid_callback';
export type AccountChart = Readonly<{id:string;name:string;localDate:string;localTime:string|null;timeZone:string|null;placeName:string}>;
export type AccountResult = Readonly<{kind:'ready';status:AccountStatus;charts:readonly AccountChart[]}> |
  Readonly<{kind:'failure';reason:AccountFailure}> | Readonly<{kind:'not_available'}>;
export interface AccountTransport { isNative:()=>boolean; invoke:(name:string,args:unknown)=>Promise<unknown>; }
const failures=new Set<AccountFailure>(['unavailable','busy','denied','authorization','network','cache','invalid_callback']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const text=(value:unknown,max:number):value is string => typeof value==='string' && value.length<=max && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value);
function chart(value:unknown):AccountChart|null {
  if(!value || typeof value!=='object' || Array.isArray(value)) return null;
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join(',')!=='id,localDate,localTime,name,placeName,timeZone' ||
    typeof v['id']!=='string' || !uuid.test(v['id']) || !text(v['name'],255) || !v['name'].trim() ||
    typeof v['localDate']!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(v['localDate']) ||
    !(v['localTime']===null || (typeof v['localTime']==='string' && /^\d{2}:\d{2}:\d{2}$/.test(v['localTime']))) ||
    !(v['timeZone']===null || (text(v['timeZone'],80) && v['timeZone'].length>0)) || !text(v['placeName'],160)) return null;
  return Object.freeze({id:v['id'],name:v['name'],localDate:v['localDate'],localTime:v['localTime'],timeZone:v['timeZone'],placeName:v['placeName']});
}
export async function requestAccount(transport:AccountTransport,operation:AccountOperation):Promise<AccountResult> {
  if(!transport.isNative()) return {kind:'not_available'};
  try {
    const value=await transport.invoke('account_control',{operation});
    if(!value || typeof value!=='object' || Array.isArray(value)) return {kind:'failure',reason:'unavailable'};
    const raw=value as Record<string,unknown>;
    if(Object.keys(raw).sort().join(',')!=='charts,status,version' || raw['version']!==1 || typeof raw['status']!=='string') return {kind:'failure',reason:'unavailable'};
    const status=raw['status'];
    if(failures.has(status as AccountFailure) && raw['charts']===null) return {kind:'failure',reason:status as AccountFailure};
    if(!['idle','pending','connected','synced'].includes(status)) return {kind:'failure',reason:'unavailable'};
    if(status!=='synced' && raw['charts']!==null) return {kind:'failure',reason:'unavailable'};
    if(status==='synced') {
      if(!Array.isArray(raw['charts']) || raw['charts'].length>500) return {kind:'failure',reason:'unavailable'};
      const values:AccountChart[]=[];const ids=new Set<string>();
      for(const item of raw['charts']) {const itemChart=chart(item);if(!itemChart || ids.has(itemChart.id)) return {kind:'failure',reason:'unavailable'};ids.add(itemChart.id);values.push(itemChart);}
      return {kind:'ready',status:'synced',charts:Object.freeze(values)};
    }
    return {kind:'ready',status:status as AccountStatus,charts:[]};
  } catch { return {kind:'not_available'}; }
}
