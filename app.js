(() => {
  'use strict';

  const STORAGE_KEY = 'magic-eight-ball-settings-v1';
  const SHAKE_THRESHOLD = 15;
  const SHAKE_COOLDOWN_MS = 1500;
  const MAX_ANSWERS = 30;
  const MIN_ANSWERS = 3;

  const DEFAULTS = {
    muted: false,
    revealSeconds: 4,
    operator: 'lt',
    threshold: 4,
    thenGroup: 'yes',
    answers: [
      { text: 'You got it!', group: 'yes' },
      { text: 'Absolutely!', group: 'yes' },
      { text: 'Go for it!', group: 'yes' },
      { text: 'Looks great!', group: 'yes' },
      { text: 'Maybe!', group: 'maybe' },
      { text: 'Could be!', group: 'maybe' },
      { text: 'Ask again!', group: 'maybe' },
      { text: 'Not sure yet!', group: 'maybe' },
      { text: 'Probably not!', group: 'no' },
      { text: 'Nope!', group: 'no' },
      { text: 'Try something else!', group: 'no' },
      { text: 'Not this time!', group: 'no' }
    ]
  };

  const hints = {
    array: { icon: '📚', title: 'What is a LIST?', text: 'A list (also called an array) stores lots of things in order. Programmers start counting the spots at 0, so the first answer is Answer[0].' },
    random: { icon: '🎲', title: 'What is RANDOM?', text: 'RANDOM asks the computer to pick a number for you. If there are 12 answers, the computer can pick any number from 0 through 11.' },
    if: { icon: '🧠', title: 'What is IF → THEN → ELSE?', text: 'It is a decision. IF something is true, THEN do one thing. ELSE, do the other thing. Change the pieces and watch the decision change!' },
    timing: { icon: '⏱️', title: 'What is timing?', text: 'This number tells the Magic 8 Ball how long to keep mixing before the answer is revealed. Try 1 second, then 8 seconds, and compare what happens.' },
    trace: { icon: '🔎', title: 'Follow the program', text: 'This shows the steps the program took after the answer is revealed: the random number, whether the IF rule was true or false, and the answer it chose.' }
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    ball: $('ball'), answerText: $('answerText'), statusText: $('statusText'), enableShakeButton: $('enableShakeButton'), askButton: $('askButton'), motionHelp: $('motionHelp'), soundToggle: $('soundToggle'),
    learningToggle: $('learningToggle'), learningToggleLabel: $('learningToggleLabel'), learningPanel: $('learningPanel'), answersEditor: $('answersEditor'), answerCountLabel: $('answerCountLabel'), rangeLabel: $('rangeLabel'), randomMaxLabel: $('randomMaxLabel'), lastRandomNumber: $('lastRandomNumber'),
    operatorSelect: $('operatorSelect'), thresholdInput: $('thresholdInput'), thenGroupSelect: $('thenGroupSelect'), revealSeconds: $('revealSeconds'), ruleWarning: $('ruleWarning'), traceBox: $('traceBox'), addAnswerButton: $('addAnswerButton'), resetButton: $('resetButton'),
    hintDialog: $('hintDialog'), hintIcon: $('hintIcon'), hintTitle: $('hintTitle'), hintText: $('hintText')
  };

  let settings = loadSettings();
  let shakeEnabled = false;
  let busy = false;
  let lastShakeAt = 0;
  let audioContext = null;
  let revealTimer = null;

  function cloneDefaults() { return JSON.parse(JSON.stringify(DEFAULTS)); }
  function clampNumber(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback; }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !Array.isArray(saved.answers)) return cloneDefaults();
      const merged = { ...cloneDefaults(), ...saved };
      merged.answers = saved.answers.filter((answer) => answer && typeof answer.text === 'string').slice(0, MAX_ANSWERS).map((answer) => ({ text: answer.text.slice(0, 60) || 'Mystery answer!', group: ['yes','maybe','no'].includes(answer.group) ? answer.group : 'maybe' }));
      if (merged.answers.length < MIN_ANSWERS) merged.answers = cloneDefaults().answers;
      merged.revealSeconds = clampNumber(merged.revealSeconds, 1, 10, 4);
      merged.threshold = clampNumber(merged.threshold, 0, merged.answers.length - 1, 4);
      if (!['lt','gt','eq'].includes(merged.operator)) merged.operator = 'lt';
      if (!['yes','maybe','no'].includes(merged.thenGroup)) merged.thenGroup = 'yes';
      merged.muted = Boolean(merged.muted);
      return merged;
    } catch { return cloneDefaults(); }
  }

  function saveSettings() { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  function render() { renderSoundButton(); renderAnswerList(); updateRuleControls(); updateRangeLabels(); validateRule(); }

  function renderSoundButton() {
    els.soundToggle.textContent = settings.muted ? '🔇' : '🔊';
    els.soundToggle.setAttribute('aria-label', settings.muted ? 'Turn sounds on' : 'Mute sounds');
    els.soundToggle.title = settings.muted ? 'Turn sounds on' : 'Mute sounds';
  }

  function trashIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.setAttribute('aria-hidden','true');
    svg.innerHTML = '<path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>';
    return svg;
  }

  function renderAnswerList() {
    els.answersEditor.replaceChildren();
    settings.answers.forEach((answer, index) => {
      const row = document.createElement('div'); row.className = 'answer-row';
      const label = document.createElement('span'); label.className = 'answer-index'; label.textContent = `Answer[${index}]`;
      const input = document.createElement('input'); input.type = 'text'; input.maxLength = 60; input.value = answer.text; input.setAttribute('aria-label', `Answer ${index} text`);
      input.addEventListener('change', () => { settings.answers[index].text = input.value.trim() || `Answer ${index}`; input.value = settings.answers[index].text; saveSettings(); });
      const select = document.createElement('select'); select.setAttribute('aria-label', `Answer ${index} group`);
      [['yes','YES'],['maybe','MAYBE'],['no','NO']].forEach(([value,text]) => { const option = document.createElement('option'); option.value=value; option.textContent=text; option.selected=answer.group===value; select.append(option); });
      select.addEventListener('change', () => { settings.answers[index].group = select.value; saveSettings(); validateRule(); });
      const remove = document.createElement('button'); remove.type='button'; remove.className='delete-answer'; remove.setAttribute('aria-label', `Delete Answer ${index}`); remove.title='Delete this answer'; remove.disabled = settings.answers.length <= MIN_ANSWERS; remove.append(trashIcon());
      remove.addEventListener('click', () => deleteAnswer(index));
      row.append(label,input,select,remove); els.answersEditor.append(row);
    });
    els.addAnswerButton.disabled = settings.answers.length >= MAX_ANSWERS;
  }

  function updateRuleControls() { els.operatorSelect.value=settings.operator; els.thresholdInput.value=settings.threshold; els.thresholdInput.max=Math.max(0,settings.answers.length-1); els.thenGroupSelect.value=settings.thenGroup; els.revealSeconds.value=settings.revealSeconds; }
  function updateRangeLabels() { const max=Math.max(0,settings.answers.length-1); els.answerCountLabel.textContent=`${settings.answers.length} items`; els.rangeLabel.textContent=`0–${max}`; els.randomMaxLabel.textContent=String(max); }

  function validateRule() {
    const groupCount=settings.answers.filter((answer)=>answer.group===settings.thenGroup).length;
    const remainingCount=settings.answers.length-groupCount;
    if(groupCount===0){els.ruleWarning.textContent=`Add at least one ${settings.thenGroup.toUpperCase()} answer so THEN has something to choose.`;return false;}
    if(remainingCount===0){els.ruleWarning.textContent='Move at least one answer to another group so ELSE has something to choose.';return false;}
    els.ruleWarning.textContent='';return true;
  }

  function evaluateCondition(randomNumber){if(settings.operator==='gt')return randomNumber>settings.threshold;if(settings.operator==='eq')return randomNumber===settings.threshold;return randomNumber<settings.threshold;}
  function chooseAnswer(){const randomNumber=Math.floor(Math.random()*settings.answers.length);const conditionTrue=evaluateCondition(randomNumber);let candidateIndexes=settings.answers.map((answer,index)=>({answer,index})).filter(({answer})=>conditionTrue?answer.group===settings.thenGroup:answer.group!==settings.thenGroup).map(({index})=>index);if(candidateIndexes.length===0)candidateIndexes=settings.answers.map((_,index)=>index);const answerIndex=candidateIndexes[randomNumber%candidateIndexes.length];return{randomNumber,conditionTrue,answerIndex,answer:settings.answers[answerIndex]};}
  function formatCondition(number){const symbol=settings.operator==='gt'?'>':settings.operator==='eq'?'=':'<';return `${number} ${symbol} ${settings.threshold}`;}
  function escapeHtml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}

  function updateTrace(result){
    const truthWord=result.conditionTrue?'TRUE':'FALSE';
    const path=result.conditionTrue?`${formatCondition(result.randomNumber)} is ${truthWord} → THEN ${settings.thenGroup.toUpperCase()}`:`${formatCondition(result.randomNumber)} is ${truthWord} → ELSE remaining answers`;
    els.traceBox.innerHTML=`<div><span>RANDOM</span><strong>${result.randomNumber}</strong></div><div class="trace-arrow">↓</div><div><span>RULE</span><strong>${escapeHtml(path)}</strong></div><div class="trace-arrow">↓</div><div><span>ANSWER</span><strong>Answer[${result.answerIndex}] = “${escapeHtml(result.answer.text)}”</strong></div>`;
    els.lastRandomNumber.textContent=String(result.randomNumber);
  }

  async function askMagicEightBall(source='button'){
    if(busy||!settings.answers.length)return;
    if(!validateRule()){els.statusText.textContent='Fix the Magic Lab rule first!';return;}
    busy=true;els.askButton.disabled=true;unlockAudio();playShakeSound();clearTimeout(revealTimer);
    const result=chooseAnswer();
    const durationMs=settings.revealSeconds*1000;

    els.ball.classList.remove('is-revealed','is-mixing');
    void els.ball.offsetWidth;
    els.answerText.textContent='';
    els.statusText.textContent=source==='shake'?'Shake detected! Mixing the answers…':'Mixing the answers…';
    els.ball.classList.add('is-mixing');

    revealTimer=setTimeout(()=>{
      els.ball.classList.remove('is-mixing');
      void els.ball.offsetWidth;
      els.answerText.textContent=result.answer.text;
      els.ball.classList.add('is-revealed');
      updateTrace(result);
      els.statusText.textContent=`Answer[${result.answerIndex}] says: “${result.answer.text}”`;
      playBubbleSound();playRevealSound(result.answer.group);
      busy=false;els.askButton.disabled=false;
    },durationMs);
  }

  function unlockAudio(){if(settings.muted)return;const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;if(!audioContext)audioContext=new AudioCtx();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}
  function playTone(frequency,duration,gainValue=.035,type='sine',delay=0){if(settings.muted)return;unlockAudio();if(!audioContext)return;const start=audioContext.currentTime+delay;const oscillator=audioContext.createOscillator();const gain=audioContext.createGain();oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,start);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(gainValue,start+.02);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);oscillator.connect(gain).connect(audioContext.destination);oscillator.start(start);oscillator.stop(start+duration+.04);}
  function playShakeSound(){playTone(105,.12,.025,'triangle',0);playTone(82,.14,.02,'triangle',.14);playTone(118,.12,.02,'triangle',.3);}
  function playBubbleSound(){playTone(360,.14,.018,'sine',0);playTone(510,.12,.014,'sine',.1);}
  function playRevealSound(group){const base=group==='yes'?520:group==='no'?250:390;playTone(base,.22,.03,'sine',0);playTone(base*1.25,.28,.026,'sine',.15);}

  async function enableShake(){
    unlockAudio();
    if(!('DeviceMotionEvent'in window)){els.statusText.textContent='This device does not have motion sensors. Use ASK for testing.';els.enableShakeButton.hidden=true;return;}
    try{
      if(typeof DeviceMotionEvent.requestPermission==='function'){const permission=await DeviceMotionEvent.requestPermission();if(permission!=='granted'){els.statusText.textContent='Shake permission was not granted. You can try Enable Shake again.';return;}}
      window.addEventListener('devicemotion',handleDeviceMotion,{passive:true});shakeEnabled=true;els.enableShakeButton.hidden=true;els.statusText.textContent='Shake is ready! Think of a question and shake your iPad.';els.motionHelp.textContent='Shake is enabled. The ASK button stays here only for testing.';playTone(660,.16,.025,'sine');
    }catch(error){console.warn('Motion permission error:',error);els.statusText.textContent='Could not enable shake. Make sure this page is opened over HTTPS.';}
  }

  function handleDeviceMotion(event){if(!shakeEnabled||busy)return;const acceleration=event.accelerationIncludingGravity||event.acceleration;if(!acceleration)return;const x=Number(acceleration.x)||0,y=Number(acceleration.y)||0,z=Number(acceleration.z)||0;const magnitude=Math.sqrt(x*x+y*y+z*z);const adjusted=Math.abs(magnitude-9.81);const now=Date.now();if(adjusted>=SHAKE_THRESHOLD&&now-lastShakeAt>SHAKE_COOLDOWN_MS){lastShakeAt=now;askMagicEightBall('shake');}}

  function toggleLearningPanel(){const open=els.learningToggle.getAttribute('aria-expanded')!=='true';els.learningToggle.setAttribute('aria-expanded',String(open));els.learningPanel.hidden=!open;els.learningToggleLabel.textContent=open?'🔬 CLOSE THE MAGIC LAB':'🔬 OPEN THE MAGIC LAB';}
  function addAnswer(){if(settings.answers.length>=MAX_ANSWERS)return;settings.answers.push({text:'New answer!',group:'maybe'});settings.threshold=Math.min(settings.threshold,settings.answers.length-1);saveSettings();render();}
  function deleteAnswer(index){if(settings.answers.length<=MIN_ANSWERS)return;settings.answers.splice(index,1);settings.threshold=Math.min(settings.threshold,settings.answers.length-1);saveSettings();render();}

  function resetDefaults(){const ok=window.confirm('Reset all answers and Magic Lab settings back to the originals?');if(!ok)return;settings=cloneDefaults();saveSettings();els.ball.classList.remove('is-mixing','is-revealed');els.answerText.innerHTML='SHAKE<br>ME!';els.lastRandomNumber.textContent='—';els.traceBox.innerHTML='<div><span>RANDOM</span><strong>—</strong></div><div class="trace-arrow">↓</div><div><span>RULE</span><strong>Shake or tap ASK</strong></div><div class="trace-arrow">↓</div><div><span>ANSWER</span><strong>—</strong></div>';render();els.statusText.textContent='Defaults restored. Think of a question!';}
  function openHint(key){const hint=hints[key];if(!hint)return;els.hintIcon.textContent=hint.icon;els.hintTitle.textContent=hint.title;els.hintText.textContent=hint.text;if(typeof els.hintDialog.showModal==='function')els.hintDialog.showModal();else window.alert(`${hint.title}\n\n${hint.text}`);}

  els.askButton.addEventListener('click',()=>askMagicEightBall('button'));els.enableShakeButton.addEventListener('click',enableShake);els.learningToggle.addEventListener('click',toggleLearningPanel);els.addAnswerButton.addEventListener('click',addAnswer);els.resetButton.addEventListener('click',resetDefaults);
  els.soundToggle.addEventListener('click',()=>{settings.muted=!settings.muted;saveSettings();renderSoundButton();if(!settings.muted){unlockAudio();playTone(600,.16,.02,'sine');}});
  els.operatorSelect.addEventListener('change',()=>{settings.operator=els.operatorSelect.value;saveSettings();validateRule();});
  els.thresholdInput.addEventListener('change',()=>{settings.threshold=Math.round(clampNumber(els.thresholdInput.value,0,settings.answers.length-1,0));els.thresholdInput.value=settings.threshold;saveSettings();});
  els.thenGroupSelect.addEventListener('change',()=>{settings.thenGroup=els.thenGroupSelect.value;saveSettings();validateRule();});
  els.revealSeconds.addEventListener('change',()=>{settings.revealSeconds=clampNumber(els.revealSeconds.value,1,10,4);els.revealSeconds.value=settings.revealSeconds;saveSettings();});
  document.querySelectorAll('[data-hint]').forEach((button)=>button.addEventListener('click',()=>openHint(button.dataset.hint)));
  document.addEventListener('pointerdown',unlockAudio,{once:true,passive:true});

  if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js').catch((error)=>console.warn('Service worker:',error)));}
  if('DeviceMotionEvent'in window&&typeof DeviceMotionEvent.requestPermission!=='function'){window.addEventListener('devicemotion',handleDeviceMotion,{passive:true});shakeEnabled=true;els.enableShakeButton.hidden=true;els.statusText.textContent='Shake is ready! Think of a question and shake your device.';}
  render();
})();
