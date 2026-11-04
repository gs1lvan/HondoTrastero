/* Catálogo compartido: añadir aquí cada nuevo tema y su CSS en estilos.css. */
(() => {
'use strict';
const themes = [
 {id:'carton', name:'Cartón', preview:'', color:'#9b612f'},
 {id:'azul-oscuro', name:'Azul oscuro', preview:'style-preview-blue', color:'#14253b'},
 {id:'terminal', name:'>_', preview:'style-preview-terminal', color:'#07110d'}
];
const terminalFonts=['Geist Mono','JetBrains Mono','Fira Code','IBM Plex Mono','Space Mono','Google Sans Code'];
const fontKey='hondotrastero:terminal-tipografia';
let terminalFont='Geist Mono';
try{const savedFont=localStorage.getItem(fontKey);if(terminalFonts.includes(savedFont))terminalFont=savedFont}catch{}
function applyTerminalFont(name,persist=false){
 terminalFont=terminalFonts.includes(name)?name:terminalFonts[0];
 document.documentElement.style.setProperty('--terminal-font','"'+terminalFont+'",monospace');
 document.querySelectorAll('[data-terminal-font]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.terminalFont===terminalFont)));
 if(persist)try{localStorage.setItem(fontKey,terminalFont)}catch{}
}
function loadTerminalFonts(){
 if(document.getElementById('terminalFontStylesheet'))return;
 const link=document.createElement('link');link.id='terminalFontStylesheet';link.rel='stylesheet';
 link.href='https://fonts.googleapis.com/css2?'+terminalFonts.map(name=>'family='+name.replace(/ /g,'+')+':wght@400;700').join('&')+'&display=swap';
 document.head.append(link);
}
applyTerminalFont(terminalFont);
const key='hondotrastero:estilo';
function saved(){try{return localStorage.getItem(key)}catch{return null}}
const badgeTransparencyKey='hondotrastero:terminal-transparencia-nombre';
let badgeTransparency=35;
try{const raw=localStorage.getItem(badgeTransparencyKey);if(raw!==null&&Number.isFinite(Number(raw)))badgeTransparency=Math.min(100,Math.max(0,Number(raw)))}catch{}
function setBadgeTransparency(value,persist=false){
 badgeTransparency=Math.min(100,Math.max(0,Math.round(Number(value)||0)));
 document.documentElement.style.setProperty('--terminal-badge-opacity',(100-badgeTransparency)+'%');
 const input=document.getElementById('terminalBadgeTransparency'),output=document.getElementById('terminalBadgeTransparencyValue');
 if(input){input.value=badgeTransparency;input.setAttribute('aria-valuetext',badgeTransparency+' %')}
 if(output)output.textContent=badgeTransparency+' %';
 if(persist)try{localStorage.setItem(badgeTransparencyKey,String(badgeTransparency))}catch{}
}
setBadgeTransparency(badgeTransparency);
const badgeIntensityKey='hondotrastero:terminal-intensidad-fondo';
let badgeIntensity=25;
try{const raw=localStorage.getItem(badgeIntensityKey);if(raw!==null&&Number.isFinite(Number(raw)))badgeIntensity=Math.min(100,Math.max(0,Number(raw)))}catch{}
function setBadgeIntensity(value,persist=false){
 badgeIntensity=Math.min(100,Math.max(0,Math.round(Number(value)||0)));
 document.documentElement.style.setProperty('--terminal-badge-color','hsl('+tone+' '+saturation+'% '+(4+badgeIntensity*.5)+'%)');
 const input=document.getElementById('terminalBadgeIntensity'),output=document.getElementById('terminalBadgeIntensityValue');
 if(input){input.value=badgeIntensity;input.setAttribute('aria-valuetext',badgeIntensity+' %')}
 if(output)output.textContent=badgeIntensity+' %';
 if(persist)try{localStorage.setItem(badgeIntensityKey,String(badgeIntensity))}catch{}
}
const brightnessKey='hondotrastero:terminal-brillo';
const toneKey='hondotrastero:terminal-tono';
const saturationKey='hondotrastero:terminal-saturacion';
let saturation=100;
try{const raw=localStorage.getItem(saturationKey);if(raw!==null&&Number.isFinite(Number(raw)))saturation=Math.min(100,Math.max(0,Number(raw)))}catch{}
let tone=132;
try{const raw=localStorage.getItem(toneKey);if(raw!==null&&Number.isFinite(Number(raw)))tone=Math.min(360,Math.max(0,Number(raw)))}catch{}
let brightness=75;
try{const value=Number(localStorage.getItem(brightnessKey));if(value>=0&&value<=100)brightness=Math.round(value)}catch{}
function setBrightness(value,persist=false){
 brightness=Math.min(100,Math.max(0,Math.round(Number.isFinite(Number(value))?Number(value):75)));
 const blend=hex=>{
  const rgb=[0,2,4].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255);
  const high=Math.max(...rgb),low=Math.min(...rgb),light=(high+low)/2;
  const colorSaturation=high===low?0:(high-low)/(1-Math.abs(2*light-1));
  return 'color-mix(in srgb, hsl('+tone+' '+(colorSaturation*saturation)+'% '+(light*100)+'%) '+brightness+'%, hsl('+tone+' '+(42*saturation/100)+'% 4.7%))';
 };
 document.documentElement.style.setProperty('--terminal-accent','color-mix(in srgb, hsl('+tone+' '+saturation+'% 61%) '+brightness+'%, hsl('+tone+' '+(40*saturation/100)+'% 4%))');
 document.documentElement.style.setProperty('--terminal-edge','color-mix(in srgb, hsl('+tone+' '+(52*saturation/100)+'% 28%) '+brightness+'%, hsl('+tone+' '+(40*saturation/100)+'% 4%))');
 document.documentElement.style.setProperty('--terminal-fill','color-mix(in srgb, hsl('+tone+' '+(53*saturation/100)+'% 10%) '+brightness+'%, hsl('+tone+' '+(40*saturation/100)+'% 4%))');
 document.documentElement.style.setProperty('--terminal-surface','hsl('+tone+' '+(40*saturation/100)+'% 4%)');
 setBadgeIntensity(badgeIntensity);
 document.documentElement.style.setProperty('--terminal-text',blend('76ff91'));
 document.documentElement.style.setProperty('--terminal-muted',blend('8ccea0'));
 document.documentElement.style.setProperty('--terminal-bright',blend('b8ffc6'));
 document.documentElement.style.setProperty('--terminal-glow',brightness===100?'0 0 12px color-mix(in srgb,var(--terminal-accent) 15%,transparent)':'none');
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
 if(theme.id==='terminal')loadTerminalFonts();
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
window.addEventListener('storage',e=>{if(e.key===key)apply(e.newValue);if(e.key===badgeIntensityKey)setBadgeIntensity(e.newValue===null?25:e.newValue);if(e.key===badgeTransparencyKey)setBadgeTransparency(e.newValue===null?35:e.newValue);if(e.key===fontKey)applyTerminalFont(e.newValue);if(e.key===brightnessKey)setBrightness(e.newValue===null?75:e.newValue);if(e.key===toneKey)setTone(e.newValue===null?132:e.newValue);if(e.key===saturationKey)setSaturation(e.newValue===null?100:e.newValue)});
document.addEventListener('DOMContentLoaded',()=>{
 const options=document.getElementById('styleOptions');
 document.getElementById('terminalBadgeIntensity').addEventListener('input',e=>setBadgeIntensity(e.target.value,true));
 setBadgeIntensity(badgeIntensity);
 document.getElementById('terminalBadgeTransparency').addEventListener('input',e=>setBadgeTransparency(e.target.value,true));
 setBadgeTransparency(badgeTransparency);
 const fontOptions=document.getElementById('terminalFontOptions');
 for(const font of terminalFonts){
  const button=document.createElement('button');button.type='button';button.className='terminal-font-badge';button.dataset.terminalFont=font;button.style.fontFamily='"'+font+'",monospace';
  const name=document.createElement('span');name.textContent=font;
  const sample=document.createElement('span');sample.className='terminal-font-sample';sample.textContent='>_ Aa 0123';
  button.append(name,sample);button.addEventListener('click',()=>applyTerminalFont(font,true));fontOptions.append(button);
 }
 applyTerminalFont(terminalFont);
 document.getElementById('terminalSaturation').addEventListener('input',e=>setSaturation(e.target.value,true));
 setSaturation(saturation);
 document.getElementById('terminalTone').addEventListener('input',e=>setTone(e.target.value,true));
 setTone(tone);
 document.getElementById('terminalBrightness').addEventListener('input',e=>setBrightness(e.target.value,true));
 document.getElementById('resetTerminalBrightness').addEventListener('click',()=>{setBadgeIntensity(25,true);setBadgeTransparency(35,true);setSaturation(100,true);setTone(132,true);setBrightness(75,true)});
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
