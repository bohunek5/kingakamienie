import {unlockAtelier,lockAtelier} from './access.js';

await unlockAtelier();
await import('./style.css');
document.querySelector('#atelier-app').hidden=false;
document.querySelector('#lock-atelier').addEventListener('click',lockAtelier);
try {
  await import('./main.js');
} catch(error) {
  console.error('Nie udało się uruchomić atelier.',error);
  const loader=document.querySelector('#scene-loader');
  if(loader){
    loader.style.pointerEvents='auto';
    loader.replaceChildren();
    const message=document.createElement('p');
    message.textContent='Nie udało się otworzyć podglądu 3D. Odśwież stronę, aby spróbować ponownie.';
    const retry=document.createElement('button');retry.textContent='Odśwież';retry.type='button';
    retry.addEventListener('click',()=>location.reload());loader.append(message,retry);
  }
}
