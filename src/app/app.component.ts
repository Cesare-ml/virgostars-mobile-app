import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { ObserverLocation, SkyChart, SkyChartService } from './sky-chart.service';
@Component({selector:'app-root',standalone:true,templateUrl:'./app.component.html',styleUrl:'./app.component.css'})
export class AppComponent implements OnInit,OnDestroy {
 readonly chart=signal<SkyChart|null>(null); readonly loading=signal(true); readonly locating=signal(true);
 readonly error=signal<string|null>(null); readonly latitudeInput=signal(''); readonly longitudeInput=signal('');
 readonly signs=this.sky.signs; private timer:ReturnType<typeof setInterval>|null=null; private location:ObserverLocation|null=null;
 constructor(private readonly sky:SkyChartService){}
 ngOnInit():void{this.requestDeviceLocation();this.timer=setInterval(()=>{if(this.location)this.recalculate();},30_000);}
 ngOnDestroy():void{if(this.timer)clearInterval(this.timer);}
 requestDeviceLocation():void{
  this.error.set(null);this.locating.set(true);this.loading.set(true);
  if(!navigator.geolocation){this.locating.set(false);this.loading.set(false);this.error.set('La geolocalizzazione non è disponibile. Inserisci le coordinate.');return;}
  navigator.geolocation.getCurrentPosition(position=>{
   this.location={latitude:position.coords.latitude,longitude:position.coords.longitude,source:'device'};
   this.latitudeInput.set(position.coords.latitude.toFixed(5));this.longitudeInput.set(position.coords.longitude.toFixed(5));
   this.locating.set(false);this.recalculate();
  },failure=>{
   this.locating.set(false);this.loading.set(false);
   this.error.set(failure.code===failure.PERMISSION_DENIED?'Permesso di posizione negato. Consenti la posizione oppure inserisci le coordinate.':'Non riesco a ottenere la posizione. Verifica il GPS o inserisci le coordinate.');
  },{enableHighAccuracy:true,timeout:15_000,maximumAge:60_000});
 }
 useManualLocation():void{
  const latitude=Number(this.latitudeInput()),longitude=Number(this.longitudeInput());
  if(!this.latitudeInput().trim()||!this.longitudeInput().trim()||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180){this.error.set('Inserisci una latitudine tra −90 e 90 e una longitudine tra −180 e 180.');return;}
  this.location={latitude,longitude,source:'manual'};this.error.set(null);this.recalculate();
 }
 onLatitudeChange(value:string):void{this.latitudeInput.set(value);} onLongitudeChange(value:string):void{this.longitudeInput.set(value);}
 private recalculate():void{if(!this.location)return;this.loading.set(true);try{this.chart.set(this.sky.calculate(new Date(),this.location));this.error.set(null);}catch{this.chart.set(null);this.error.set('Il calcolo del cielo non è riuscito. Riprova tra qualche istante.');}finally{this.loading.set(false);}}
 formatLongitude(value:number):string{return value.toFixed(2).replace('.', '° ')+'′';}
 formatClock(value:Date):string{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'medium'}).format(value);}
 formatCoordinates(location:ObserverLocation):string{return Math.abs(location.latitude).toFixed(3)+'° '+(location.latitude>=0?'N':'S')+' · '+Math.abs(location.longitude).toFixed(3)+'° '+(location.longitude>=0?'E':'W');}
}