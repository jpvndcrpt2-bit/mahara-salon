// Camera stays local; the visitor must actively grant browser permission.
export function addCamera({toolbar,onFrame,onStop,ready,status}){
 const start=document.createElement('button');start.className='text-link';start.textContent='پیش‌نمایش زنده با دوربین';start.type='button';
 const stop=document.createElement('button');stop.className='text-link';stop.textContent='ثبت تصویر و بستن دوربین';stop.hidden=true;stop.type='button';
 const v=document.createElement('video');v.autoplay=true;v.muted=true;v.playsInline=true;let stream=null,timer=null,busy=false,version=0;
 const halt=()=>{version++;if(timer)clearInterval(timer);timer=null;stream?.getTracks().forEach(t=>t.stop());stream=null;v.srcObject=null;start.hidden=false;stop.hidden=true;onStop()};
 start.onclick=async()=>{if(!navigator.mediaDevices?.getUserMedia){status('دوربین در این مرورگر در دسترس نیست؛ عکس انتخاب کنید.');return}start.disabled=true;const token=++version;try{await ready();const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:800}},audio:false});if(token!==version){s.getTracks().forEach(t=>t.stop());return}stream=s;v.srcObject=s;await v.play();start.hidden=true;stop.hidden=false;const frame=async()=>{if(busy||!v.videoWidth||!stream)return;busy=true;try{await onFrame(v)}catch{status('دوربین آماده نشد؛ یک عکس انتخاب کنید.');halt()}finally{busy=false}};await frame();timer=setInterval(frame,250)}catch(e){status(e.name==='NotAllowedError'?'دسترسی دوربین داده نشد؛ می‌توانید عکس انتخاب کنید.':'دوربین در دسترس نیست؛ عکس انتخاب کنید.');halt()}finally{start.disabled=false}};
 stop.onclick=halt;toolbar.append(start,stop);window.addEventListener('pagehide',halt);document.addEventListener('visibilitychange',()=>{if(document.hidden&&stream)halt()});return halt;
}
