/* Catálogo compartido: añadir aquí cada nuevo tema y su CSS en estilos.css. */
(() => {
'use strict';
const themes = [
 {id:'carton', name:'Cartón', preview:'', color:'#9b612f'},
 {id:'azul-oscuro', name:'Azul oscuro', preview:'style-preview-blue', color:'#14253b'},
 {id:'terminal', name:'Terminal', preview:'style-preview-terminal', color:'#07110d'}
];
const key='hondotrastero:estilo';
function saved(){try{return localStorage.getItem(key)}catch{return null}}
function apply(id, persist=false){
 const theme=themes.find(t=>t.id===id)||themes[0];
 document.documentElement.dataset.style=theme.id;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.color);
 if(persist)try{localStorage.setItem(key,theme.id)}catch{}
 document.querySelectorAll('[data-style-choice]').forEach(b=>{
  const selected=b.dataset.styleChoice===theme.id;
  b.setAttribute('aria-pressed',String(selected));
  b.querySelector('.style-tick').textContent=selected?'✓':'';
 });
}
apply(saved());
window.addEventListener('storage',e=>{if(e.key===key)apply(e.newValue)});
document.addEventListener('DOMContentLoaded',()=>{
 const options=document.getElementById('styleOptions');
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
