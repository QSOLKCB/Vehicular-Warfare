// One preference belongs to the page, across sortie restarts and replay seeks.
export function bindChartControls(change){
  const option=document.getElementById('retroChart'),toggle=document.getElementById('chartSwitch');
  if(!option)return null;
  try{option.checked=localStorage.getItem('vw-gfx:tactical-display')==='retro';}catch{}
  function sync(){
    toggle.setAttribute('aria-pressed',String(option.checked));
    document.getElementById('chart').dataset.display=option.checked?'retro':'modern';
  }
  option.addEventListener('change',()=>{
    sync();
    try{localStorage.setItem('vw-gfx:tactical-display',option.checked?'retro':'modern');}catch{}
    change(option.checked);
  });
  toggle.addEventListener('click',()=>option.click());
  sync();
  return option;
}
