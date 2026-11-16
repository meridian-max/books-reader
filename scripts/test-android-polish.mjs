import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {connect} from './android-cdp.mjs';
const adb='/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk/platform-tools/adb';
const command=(...args)=>execFileSync(adb,['-s','emulator-5570',...args],{encoding:'utf8'});
const shell=(...args)=>command('shell',...args), sleep=ms=>new Promise(r=>setTimeout(r,ms));
assert.match(command('emu','avd','name'),/Books_Test/);
const original={timeout:shell('settings','get','system','screen_off_timeout').trim(),fontScale:shell('settings','get','system','font_scale').trim(),size:shell('wm','size'),density:shell('wm','density')};
let c, inset=0, physicalWidth=1080; const checks=[];
async function restart(){c?.close();shell('input','keyevent','KEYCODE_WAKEUP');shell('wm','dismiss-keyguard');shell('am','force-stop','app.books.reader');shell('am','start','-n','app.books.reader/.MainActivity');execFileSync('bash',['scripts/connect-android.sh']);c=await connect();await c.poll(()=>!!document.querySelector('.continue-card'));await c.evaluate(()=>document.fonts.ready.then(()=>true));await sleep(400);const display=shell('dumpsys','window','displays');const top=[...display.matchAll(/type=(?:statusBars|displayCutout) frame=\[0,0\]\[\d+,(\d+)\] visible=true[^\n]*sideHint=TOP/g)].map(m=>Number(m[1]));assert.ok(top.length,'Android reports a visible top system inset');inset=Math.max(...top);const size=shell('wm','size');physicalWidth=Number((size.match(/Override size: (\d+)/)??size.match(/Physical size: (\d+)/))[1]);}
async function tap(selector){const box=await c.evaluate(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:innerWidth}},selector);shell('input','tap',String(Math.round(box.x*physicalWidth/box.width)),String(inset+Math.round(box.y*physicalWidth/box.width)));await sleep(300);}
async function shot(name){await c.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true)))));await sleep(500);await writeFile(`docs/screenshots/polish-1.8.0/${name}.png`,execFileSync(adb,['-s','emulator-5570','exec-out','screencap','-p'],{maxBuffer:16*1024*1024}));}
async function layout(name){const result=await c.evaluate(()=>{const page=document.querySelector('#page');return {width:innerWidth,bodyWidth:document.body.scrollWidth,pageWidth:page.scrollWidth,pageClient:page.clientWidth,navDirection:getComputedStyle(document.querySelector('.bottom-nav')).flexDirection,font:getComputedStyle(document.querySelector('h1,.library-total')).fontFamily}});assert.ok(result.bodyWidth<=result.width+1,JSON.stringify(result));assert.ok(result.pageWidth<=result.pageClient+1,JSON.stringify(result));checks.push({name,status:'passed',...result});console.log('PASS',name);}
try{
 shell('settings','put','system','screen_off_timeout','1800000');
 await restart();await layout('Phone Home');await shot('home-after');
 await tap('[data-tab=library]');await layout('Phone library');await shot('library-after');
 const before=await c.evaluate(()=>document.querySelector('#page').scrollTop);
 shell('input','swipe','520','1700','520','700','420');await sleep(600);
 const after=await c.evaluate(()=>document.querySelector('#page').scrollTop);assert.ok(after>before+100);
 await tap('[data-tab=home]');await c.poll(()=>!!document.querySelector('.continue-card'));await tap('[data-tab=library]');
 const restored=await c.evaluate(()=>document.querySelector('#page').scrollTop);assert.ok(Math.abs(restored-after)<2);checks.push({name:'ADB library swipe and saved scroll on tab return',status:'passed',before,after,restored});
 await tap('[data-tab=home]');await c.poll(()=>!!document.querySelector('.continue-card'));
 await tap('[data-action=mobile-menu]');await tap('[data-action=app-night]');await c.poll(()=>document.documentElement.dataset.appTheme==='material');await layout('Pearl Home');await shot('home-light');
 await tap('[data-action=mobile-menu]');await tap('[data-action=app-night]');await c.poll(()=>document.documentElement.dataset.appTheme==='classic');
 shell('settings','put','system','font_scale','1.3');await restart();await layout('Android font scale 1.3 Home');await shot('home-large-text');
 await tap('[data-tab=library]');await layout('Android font scale 1.3 library');await shot('library-large-text');
 shell('settings','put','system','font_scale',original.fontScale==='null'?'1':original.fontScale);
 shell('wm','size','1600x2560');shell('wm','density','240');await restart();await layout('Expanded Android Home with navigation rail');await shot('home-tablet');
 await tap('[data-tab=library]');await layout('Expanded Android library');await shot('library-tablet');
}finally{
 c?.close();if(original.timeout==='null')shell('settings','delete','system','screen_off_timeout');else shell('settings','put','system','screen_off_timeout',original.timeout);shell('wm','size',original.size.match(/Override size: (\S+)/)?.[1]??'reset');shell('wm','density',original.density.match(/Override density: (\S+)/)?.[1]??'reset');
 if(original.fontScale==='null')shell('settings','delete','system','font_scale');else shell('settings','put','system','font_scale',original.fontScale);
 await writeFile('docs/verification-1.8.0/android-ui.json',JSON.stringify({at:new Date().toISOString(),device:'Books_Test API35 isolated emulator',original,checks},null,2)+'\n');
}
