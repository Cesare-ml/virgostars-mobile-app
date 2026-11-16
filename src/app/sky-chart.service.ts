import { Injectable } from '@angular/core';
import * as Astronomy from 'astronomy-engine';

export interface ObserverLocation { latitude:number; longitude:number; source:'device'|'manual'; }
export interface SkyBody {
  id:string; name:string; symbol:string; longitude:number; latitude:number;
  signIndex:number; sign:string; degreeInSign:number; house:number; x:number; y:number;
}
export interface SkyChart {
  timestamp:Date; location:ObserverLocation; ascendant:number; ascendantSign:string;
  ascendantDegree:number; bodies:SkyBody[]; engine:string; houseSystem:string; zodiac:string;
}
const SIGNS=['Ariete','Toro','Gemelli','Cancro','Leone','Vergine','Bilancia','Scorpione','Sagittario','Capricorno','Acquario','Pesci'] as const;
const BODIES=[
 {id:'sun',name:'Sole',symbol:'☉',body:Astronomy.Body.Sun},
 {id:'moon',name:'Luna',symbol:'☽',body:Astronomy.Body.Moon},
 {id:'mercury',name:'Mercurio',symbol:'☿',body:Astronomy.Body.Mercury},
 {id:'venus',name:'Venere',symbol:'♀',body:Astronomy.Body.Venus},
 {id:'mars',name:'Marte',symbol:'♂',body:Astronomy.Body.Mars},
 {id:'jupiter',name:'Giove',symbol:'♃',body:Astronomy.Body.Jupiter},
 {id:'saturn',name:'Saturno',symbol:'♄',body:Astronomy.Body.Saturn},
 {id:'uranus',name:'Urano',symbol:'♅',body:Astronomy.Body.Uranus},
 {id:'neptune',name:'Nettuno',symbol:'♆',body:Astronomy.Body.Neptune},
 {id:'pluto',name:'Plutone',symbol:'♇',body:Astronomy.Body.Pluto}
] as const;
const CX=160,CY=160;

/** Temporary astronomy provider. Keep this adapter isolated for replacement by the validated VirgoStars Rust engine. */
@Injectable({providedIn:'root'})
export class SkyChartService {
  calculate(timestamp:Date,location:ObserverLocation):SkyChart {
    if(!Number.isFinite(timestamp.getTime())) throw new Error('Invalid observation time');
    if(!Number.isFinite(location.latitude)||Math.abs(location.latitude)>90||
       !Number.isFinite(location.longitude)||Math.abs(location.longitude)>180) throw new Error('Invalid geographic coordinates');

    const lst=normalizeDegrees(Astronomy.SiderealTime(timestamp)*15+location.longitude);
    const rotation=Astronomy.Rotation_EQD_ECT(timestamp).rot;
    const obliquity=Math.atan2(rotation[2][1],rotation[1][1]);
    const phi=location.latitude*Math.PI/180,theta=lst*Math.PI/180;
    const ascendant=normalizeDegrees(Math.atan2(
      Math.cos(phi)*Math.cos(theta),
      -Math.sin(obliquity)*Math.sin(phi)-Math.cos(obliquity)*Math.cos(phi)*Math.sin(theta)
    )*180/Math.PI);
    const ascSign=Math.floor(ascendant/30);

    const bodies:SkyBody[]=BODIES.map((item,index)=>{
      const ecliptic=Astronomy.Ecliptic(Astronomy.GeoVector(item.body,timestamp,true));
      const longitude=normalizeDegrees(ecliptic.elon),signIndex=Math.floor(longitude/30);
      const angle=(longitude-90)*Math.PI/180,radius=91+(index%2===0?0:13);
      return {
        id:item.id,name:item.name,symbol:item.symbol,longitude,latitude:ecliptic.elat,
        signIndex,sign:SIGNS[signIndex],degreeInSign:longitude-signIndex*30,
        house:((signIndex-ascSign+12)%12)+1,
        x:CX+radius*Math.cos(angle),y:CY+radius*Math.sin(angle)
      };
    });
    return {
      timestamp:new Date(timestamp),location:{...location},ascendant,
      ascendantSign:SIGNS[ascSign],ascendantDegree:ascendant-ascSign*30,bodies,
      engine:'Astronomy Engine 2.1.19 (MIT, temporaneo)',
      houseSystem:'Whole Sign',zodiac:'Tropicale'
    };
  }
  readonly signs=SIGNS.map((name,index)=>({
    index,name:name.slice(0,3),
    x:CX+135*Math.cos((index*30+15-90)*Math.PI/180),
    y:CY+135*Math.sin((index*30+15-90)*Math.PI/180)
  }));
}
export function normalizeDegrees(value:number):number { return ((value%360)+360)%360; }
