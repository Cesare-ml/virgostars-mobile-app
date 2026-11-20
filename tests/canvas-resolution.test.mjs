import test from 'node:test';
import assert from 'node:assert/strict';
import {sharpenCanvas,transparentChartBackground} from '../src/app/astro/canvas-resolution.ts';

function fixture(width,height) {
  const canvas={width,height,getBoundingClientRect:()=>({width,height})};
  let ratio=1, redraws=0, lines=0;
  const service={renderer:{setPixelRatio:v=>ratio=v,setSize:(w,h,style)=>{assert.equal(style,false);canvas.width=Math.floor(w*ratio);canvas.height=Math.floor(h*ratio)}},
    camera:{aspect:0,updateProjectionMatrix(){}},aggiornaLineMaterialResolution(){lines++},render(){redraws++}};
  return {canvas,service,counts:()=>({ratio,redraws,lines})};
}
test('canvas uses device pixels and redraws line materials',()=>{
  const f=fixture(400,400);assert.equal(sharpenCanvas(f.service,f.canvas,2.25),true);
  assert.equal(f.canvas.width,1350);assert.equal(f.canvas.height,1350);assert.equal(f.service.camera.aspect,1);
  assert.deepEqual(f.counts(),{ratio:3.375,redraws:1,lines:1});
  sharpenCanvas(f.service,f.canvas,2.25);assert.equal(f.counts().redraws,1);
});
test('limits resolution and ignores unavailable renderer or empty bounds',()=>{
  const f=fixture(1500,1500);sharpenCanvas(f.service,f.canvas,4);assert.equal(f.canvas.width,3072);
  assert.equal(sharpenCanvas({},f.canvas,2),false);
  assert.equal(sharpenCanvas(f.service,fixture(0,0).canvas,2),false);
});
test('shared scene clears its opaque background',()=>{
  let frames=0;const disk={isMesh:true,geometry:{type:'ShapeGeometry'},position:{z:-0.002},material:{map:null,color:{getHex:()=>0}},visible:true};
  const symbol={...disk,position:{z:0},visible:true};
  const service={scene:{background:'#000',traverse:fn=>{fn(disk);fn(symbol)}},render(){frames++}};
  assert.equal(transparentChartBackground(service),true);assert.equal(service.scene.background,null);assert.equal(frames,1);
  assert.equal(disk.visible,false);assert.equal(symbol.visible,true);
  assert.equal(transparentChartBackground({}),false);
});
