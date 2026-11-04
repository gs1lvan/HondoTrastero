/* Catálogo compartido: añadir aquí cada nuevo tema y su CSS en estilos.css. */
(() => {
'use strict';
const themes = [
 {id:'carton', name:'Cartón', preview:'', color:'#9b612f'},
 {id:'azul-oscuro', name:'Azul oscuro', preview:'style-preview-blue', color:'#14253b'},
 {id:'terminal', name:'>_', preview:'style-preview-terminal', color:'#07110d'}
];
const key='hondotrastero:estilo';
function saved(){try{return localStorage.getItem(key)}catch{return null}}
const brightnessKey='hondotrastero:terminal-brillo';
const toneKey='hondotrastero:terminal-tono';
const saturationKey='hondotrastero:terminal-saturacion';
let saturation=100;
try{const raw=localStorage.getItem(saturationKey);if(raw!==null&&Number.isFinite(Number(raw)))saturation=Math.min(100,Math.max(0,Number(raw)))}catch{}
let tone=132;
try{const raw=localStorage.getItem(toneKey);if(raw!==null&&Number.isFinite(Number(raw)))tone=Math.min(360,Math.max(0,Number(raw)))}catch{}
let brightness=75;
try{const value=Number(localStorage.getItem(brightnessKey));if(value>=50&&value<=100)brightness=Math.round(value)}catch{}
function setBrightness(value,persist=false){
 brightness=Math.min(100,Math.max(50,Math.round(Number(value)||75)));
 const blend=hex=>{
  const rgb=[0,2,4].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255);
  const high=Math.max(...rgb),low=Math.min(...rgb),light=(high+low)/2;
  const colorSaturation=high===low?0:(high-low)/(1-Math.abs(2*light-1));
  return 'color-mix(in srgb, hsl('+tone+' '+(colorSaturation*saturation)+'% '+(light*100)+'%) '+brightness+'%, hsl('+tone+' '+(42*saturation/100)+'% 4.7%))';
 };
 document.documentElement.style.setProperty('--terminal-accent','hsl('+tone+' '+saturation+'% 61%)');
 document.documentElement.style.setProperty('--terminal-edge','hsl('+tone+' '+(52*saturation/100)+'% 28%)');
 document.documentElement.style.setProperty('--terminal-fill','hsl('+tone+' '+(53*saturation/100)+'% 10%)');
 document.documentElement.style.setProperty('--terminal-surface','hsl('+tone+' '+(40*saturation/100)+'% 4%)');
 document.documentElement.style.setProperty('--terminal-text',blend('76ff91'));
 document.documentElement.style.setProperty('--terminal-muted',blend('8ccea0'));
 document.documentElement.style.setProperty('--terminal-bright',blend('b8ffc6'));
 document.documentElement.style.setProperty('--terminal-glow',brightness===100?'0 0 12px #39ff6526':'none');
 const input=document.getElementById('terminalBrightness'),output=document.getElementById('terminalBrightnessValue');
 if(input){input.value=brightness;input.setAttribute('aria-valuetext',brightness+' %')}
 if(output)output.textContent=brightness+' %';
 if(persist)try{localStorage.setItem(brightnessKey,String(brightness))}catch{}
}
function setSaturation(value,persist=false){
 saturation=Math.min(100,Math.max(0,Math.round(Number(value)||0)));
 const input=document.getElementById('terminalSaturation'),output=document.getElementById('terminalSaturationValue');
 if(input){input.value=saturation;input.setAttribute('aria-valuetext',saturation+' %')}
 if(output)output.textContent=saturation+' %';
 setBrightness(brightness);
 if(persist)try{localStorage.setItem(saturationKey,String(saturation))}catch{}
}
function setTone(value,persist=false){
 tone=Math.min(360,Math.max(0,Math.round(Number(value)||0)));
 const input=document.getElementById('terminalTone'),output=document.getElementById('terminalToneValue');
 if(input){input.value=tone;input.setAttribute('aria-valuetext',tone+' grados')}
 if(output)output.textContent=tone+'°';
 setBrightness(brightness);
 if(persist)try{localStorage.setItem(toneKey,String(tone))}catch{}
}
setBrightness(brightness);
function apply(id, persist=false){
 const theme=themes.find(t=>t.id===id)||themes[0];
 document.documentElement.dataset.style=theme.id;
 const settings=document.getElementById('terminalBrightnessSettings');if(settings)settings.hidden=theme.id!=='terminal';
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.color);
 if(persist)try{localStorage.setItem(key,theme.id)}catch{}
 document.querySelectorAll('[data-style-choice]').forEach(b=>{
  const selected=b.dataset.styleChoice===theme.id;
  b.setAttribute('aria-pressed',String(selected));
  b.querySelector('.style-tick').textContent=selected?'✓':'';
 });
}
apply(saved());
window.addEventListener('storage',e=>{if(e.key===key)apply(e.newValue);if(e.key===brightnessKey)setBrightness(e.newValue===null?75:e.newValue);if(e.key===toneKey)setTone(e.newValue===null?132:e.newValue);if(e.key===saturationKey)setSaturation(e.newValue===null?100:e.newValue)});
document.addEventListener('DOMContentLoaded',()=>{
 const options=document.getElementById('styleOptions');
 document.getElementById('terminalSaturation').addEventListener('input',e=>setSaturation(e.target.value,true));
 setSaturation(saturation);
 document.getElementById('terminalTone').addEventListener('input',e=>setTone(e.target.value,true));
 setTone(tone);
 document.getElementById('terminalBrightness').addEventListener('input',e=>setBrightness(e.target.value,true));
 document.getElementById('resetTerminalBrightness').addEventListener('click',()=>{setSaturation(100,true);setTone(132,true);setBrightness(75,true)});
 setBrightness(brightness);
 for(const theme of themes){
  const b=document.createElement('button');b.type='button';b.className='style-choice';b.dataset.styleChoice=theme.id;
  const preview=document.createElement('span');preview.className='style-preview '+theme.preview;preview.setAttribute('aria-hidden','true');
  const label=document.createElement('span');label.className='style-choice-label';label.textContent=theme.name;
  const tick=document.createElement('span');tick.className='style-tick';tick.setAttribute('aria-hidden','true');
  b.append(preview,label,tick);b.addEventListener('click',()=>apply(theme.id,true));options.append(b);
 }
 apply(saved());
});
})();
