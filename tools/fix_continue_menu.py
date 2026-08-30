from pathlib import Path
import subprocess

p=Path('src/app.js')
s=p.read_text(encoding='utf-8')

old="""function updateContinueButton(){const b=$('#continueButton'),info=$('#continueInfo');if(!b)return;const live=hasLiveGame(),save=!live?savedSession():null,available=live||!!save;b.classList.toggle('hidden',!available);if(info){info.classList.toggle('hidden',!available);if(live)info.textContent=mode==='single'?'Bieżąca gra jest wstrzymana.':'Połączenie ze stołem pozostaje aktywne.';else if(save){const d=new Date(save.savedAt);info.textContent=`Zapis lokalny · ${save.state.playerCount} graczy · runda ${save.state.round} · ${d.toLocaleString('pl-PL',{dateStyle:'short',timeStyle:'short'})}`}}}"""
new="""function updateContinueButton(){const b=$('#continueButton'),info=$('#continueInfo'),single=$('#singleButton'),singleLabel=single?.querySelector('span');if(!b)return;const live=hasLiveGame(),save=!live?savedSession():null,available=live||!!save;b.hidden=!available;b.classList.toggle('hidden',!available);b.style.display=available?'grid':'none';b.setAttribute('aria-hidden',String(!available));if(singleLabel)singleLabel.textContent=available?'Nowa gra jednoosobowa':'Gra jednoosobowa';if(info){info.hidden=!available;info.classList.toggle('hidden',!available);info.style.display=available?'block':'none';if(live)info.textContent=mode==='single'?'Bieżąca gra jest wstrzymana.':'Połączenie ze stołem pozostaje aktywne.';else if(save){const d=new Date(save.savedAt);info.textContent=`Zapis lokalny · ${save.state.playerCount} graczy · runda ${save.state.round} · ${d.toLocaleString('pl-PL',{dateStyle:'short',timeStyle:'short'})}`}}}"""
if old not in s: raise SystemExit('updateContinueButton anchor not found')
s=s.replace(old,new,1)

old2="""async function startSingle(){
  if(multiplayer.isActive())await multiplayer.leave();
  const playerCount=Number($('#singlePlayers').value),difficulty=$('#botDifficulty').value;"""
new2="""async function startSingle(){
  if(multiplayer.isActive())await multiplayer.leave();
  clearSavedSession();
  const playerCount=Number($('#singlePlayers').value),difficulty=$('#botDifficulty').value;"""
if old2 not in s: raise SystemExit('startSingle anchor not found')
s=s.replace(old2,new2,1)
p.write_text(s,encoding='utf-8')

# Rebuild standalone HTML safely: retain document through app script opening, replace app script body.
html_path=Path('index.html')
html=html_path.read_text(encoding='utf-8')
open_tag='<script id="rummy500-app">'
start=html.index(open_tag)+len(open_tag)
end=html.rindex('</script>')
subprocess.run(['npx','--yes','esbuild','src/app.js','--bundle','--format=iife','--minify','--outfile=/tmp/rummy500.bundle.js'],check=True)
bundle=Path('/tmp/rummy500.bundle.js').read_text(encoding='utf-8').replace('</script','<\\/script')
html=html[:start]+'\n'+bundle+'\n  '+html[end:]
html_path.write_text(html,encoding='utf-8')

# Sanity checks
final=html_path.read_text(encoding='utf-8')
assert 'Nowa gra jednoosobowa' in final
assert 'b.style.display=available' in s
assert 'src/app.js' not in final
