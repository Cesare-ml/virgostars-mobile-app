/** Adapter for the currently pinned shared renderer, whose resize uses CSS pixels. */
type RenderInternals = {
  renderer?: {setPixelRatio:(ratio:number)=>void;setSize:(width:number,height:number,style:boolean)=>void};
  camera?: {aspect:number;updateProjectionMatrix:()=>void};
  scene?: {background:unknown;traverse?:(visit:(node:ChartSceneNode)=>void)=>void};
  aggiornaLineMaterialResolution?:()=>void;
  render?:()=>void;
};
const MAX_SIDE=3072;
const MAX_RATIO=4;
const OVERSAMPLE=1.5;

type ChartSceneNode = {isMesh?:boolean;geometry?:{type?:string};position?:{z?:number};
  material?:{map?:unknown;color?:{getHex?:()=>number}};visible?:boolean};

/** Keep the shared renderer's wheel but let the host's surface show through. */
export function transparentChartBackground(service:unknown):boolean {
  const internal=service as RenderInternals;
  if (!internal?.scene || typeof internal.render!=='function') return false;
  internal.scene.background=null;
  // The pinned monochrome renderer also inserts an opaque aspects backdrop.
  // Restrict removal to its untextured shape, depth and monochrome material.
  internal.scene.traverse?.(node=>{
    const color=node.material?.color?.getHex?.();
    if (node.isMesh && node.geometry?.type==='ShapeGeometry' &&
        Math.abs(Math.abs(node.position?.z ?? 0)-0.002)<1e-8 && !node.material?.map &&
        (color===0x000000 || color===0xffffff)) node.visible=false;
  });
  internal.render();
  return true;
}

export function sharpenCanvas(service:unknown, canvas:HTMLCanvasElement, deviceRatio:number):boolean {
  const internal=service as RenderInternals;
  const rect=canvas.getBoundingClientRect();
  if (!internal?.renderer || typeof internal.renderer.setPixelRatio!=='function' || typeof internal.renderer.setSize!=='function' ||
      !internal.camera || typeof internal.camera.updateProjectionMatrix!=='function' ||
      typeof internal.aggiornaLineMaterialResolution!=='function' || typeof internal.render!=='function' ||
      !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width<=0 || rect.height<=0) return false;
  const density=Number.isFinite(deviceRatio) && deviceRatio>0 ? deviceRatio : 1;
  const ratio=Math.min(density*OVERSAMPLE,MAX_RATIO,MAX_SIDE/Math.max(rect.width,rect.height));
  if (canvas.width===Math.floor(rect.width*ratio) && canvas.height===Math.floor(rect.height*ratio)) return true;
  internal.renderer.setPixelRatio(ratio);
  internal.renderer.setSize(rect.width,rect.height,false);
  internal.camera.aspect=rect.width/rect.height;
  internal.camera.updateProjectionMatrix();
  internal.aggiornaLineMaterialResolution();
  internal.render();
  return true;
}
