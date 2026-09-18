(() => {
  'use strict';

  const STORAGE_KEY = 'magic-eight-ball-settings-v1';
  const SHAKE_THRESHOLD = 15;
  const SHAKE_COOLDOWN_MS = 1500;
  const MAX_ANSWERS = 30;
  const MIN_ANSWERS = 3;
  const MAX_ANSWER_CHARS = 22;

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
    ball: $('ball'), answerText: $('answerText'), statusText: $('statusText'), motionHelp: $('motionHelp'), soundToggle: $('soundToggle'), permissionGate: $('permissionGate'), permissionButton: $('permissionButton'), permissionNote: $('permissionNote'),
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
  let finishTimer = null;
  let mixAudio = null;
  let clankTimer = null;
  let audioStopTimer = null;
  const ANSWER_FADE_MS = 1550;

  function cloneDefaults() { return JSON.parse(JSON.stringify(DEFAULTS)); }
  function clampNumber(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback; }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !Array.isArray(saved.answers)) return cloneDefaults();
      const merged = { ...cloneDefaults(), ...saved };
      merged.answers = saved.answers.filter((answer) => answer && typeof answer.text === 'string').slice(0, MAX_ANSWERS).map((answer) => ({ text: answer.text.slice(0, MAX_ANSWER_CHARS) || 'Mystery answer!', group: ['yes','maybe','no'].includes(answer.group) ? answer.group : 'maybe' }));
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
      const inputWrap = document.createElement('div'); inputWrap.className = 'answer-input-wrap';
      const input = document.createElement('input'); input.type = 'text'; input.maxLength = MAX_ANSWER_CHARS; input.value = answer.text; input.setAttribute('aria-label', `Answer ${index} text. Maximum ${MAX_ANSWER_CHARS} characters.`);
      const counter = document.createElement('span'); counter.className = 'answer-char-count'; counter.textContent = `${input.value.length} / ${MAX_ANSWER_CHARS}`;
      input.addEventListener('input', () => {
        counter.textContent = `${input.value.length} / ${MAX_ANSWER_CHARS}`;
        counter.classList.toggle('near-limit', input.value.length >= MAX_ANSWER_CHARS - 3);
      });
      input.addEventListener('change', () => {
        settings.answers[index].text = input.value.trim().slice(0, MAX_ANSWER_CHARS) || `Answer ${index}`;
        input.value = settings.answers[index].text;
        counter.textContent = `${input.value.length} / ${MAX_ANSWER_CHARS}`;
        counter.classList.toggle('near-limit', input.value.length >= MAX_ANSWER_CHARS - 3);
        saveSettings();
      });
      counter.classList.toggle('near-limit', input.value.length >= MAX_ANSWER_CHARS - 3);
      inputWrap.append(input,counter);
      const select = document.createElement('select'); select.setAttribute('aria-label', `Answer ${index} group`);
      [['yes','YES'],['maybe','MAYBE'],['no','NO']].forEach(([value,text]) => { const option = document.createElement('option'); option.value=value; option.textContent=text; option.selected=answer.group===value; select.append(option); });
      select.addEventListener('change', () => { settings.answers[index].group = select.value; saveSettings(); validateRule(); });
      const remove = document.createElement('button'); remove.type='button'; remove.className='delete-answer'; remove.setAttribute('aria-label', `Delete Answer ${index}`); remove.title='Delete this answer'; remove.disabled = settings.answers.length <= MIN_ANSWERS; remove.append(trashIcon());
      remove.addEventListener('click', () => deleteAnswer(index));
      row.append(label,inputWrap,select,remove); els.answersEditor.append(row);
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

  function fitAnswerText(text){
    const value=String(text).trim();
    const length=value.length;
    const longestWord=value.split(/\s+/).reduce((max,word)=>Math.max(max,word.length),0);

    let size=20;
    if(length>9) size=18;
    if(length>14) size=16;
    if(length>20) size=14;
    if(length>28) size=12;
    if(length>36) size=10.5;
    if(length>46) size=9;
    if(longestWord>9) size=Math.min(size,13);
    if(longestWord>12) size=Math.min(size,10.5);

    els.answerText.style.fontSize=`${size}px`;
    els.answerText.style.lineHeight='1';

    let tries=0;
    while(
      (els.answerText.scrollWidth>els.answerText.clientWidth+1 ||
       els.answerText.scrollHeight>els.answerText.clientHeight+1) &&
      size>6.5 &&
      tries<40
    ){
      size-=0.5;
      els.answerText.style.fontSize=`${size}px`;
      tries+=1;
    }
  }

  function updateTrace(result){
    const truthWord=result.conditionTrue?'TRUE':'FALSE';
    const path=result.conditionTrue?`${formatCondition(result.randomNumber)} is ${truthWord} → THEN ${settings.thenGroup.toUpperCase()}`:`${formatCondition(result.randomNumber)} is ${truthWord} → ELSE remaining answers`;
    els.traceBox.innerHTML=`<div><span>RANDOM</span><strong>${result.randomNumber}</strong></div><div class="trace-arrow">↓</div><div><span>RULE</span><strong>${escapeHtml(path)}</strong></div><div class="trace-arrow">↓</div><div><span>ANSWER</span><strong>Answer[${result.answerIndex}] = “${escapeHtml(result.answer.text)}”</strong></div>`;
    els.lastRandomNumber.textContent=String(result.randomNumber);
  }

  async function askMagicEightBall(source='shake'){
    if(busy||!settings.answers.length)return;
    if(!validateRule()){els.statusText.textContent='Fix the Magic Lab rule first!';return;}
    busy=true;
    unlockAudio();
    clearTimeout(revealTimer);
    clearTimeout(finishTimer);
    stopMixingAudio(0);

    const result=chooseAnswer();
    const durationMs=settings.revealSeconds*1000;

    els.ball.classList.remove('is-revealed','is-mixing');
    void els.ball.offsetWidth;
    els.answerText.textContent='';
    els.statusText.textContent='Shake detected! Mixing the answers…';
    els.ball.classList.add('is-mixing');
    startMixingAudio();

    revealTimer=setTimeout(()=>{
      els.ball.classList.remove('is-mixing');
      void els.ball.offsetWidth;
      els.answerText.textContent=result.answer.text;
      fitAnswerText(result.answer.text);
      els.ball.classList.add('is-revealed');
      fadeMixingAudio(ANSWER_FADE_MS/1000);
      updateTrace(result);
      els.statusText.textContent=`Answer[${result.answerIndex}] says: “${result.answer.text}”`;

      finishTimer=setTimeout(()=>{
        busy=false;
      },ANSWER_FADE_MS);
    },durationMs);
  }

  function unlockAudio(){
    if(settings.muted)return;
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)return;
    if(!audioContext)audioContext=new AudioCtx();
    if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
  }

  function playTone(frequency,duration,gainValue=.035,type='sine',delay=0){
    if(settings.muted)return;
    unlockAudio();
    if(!audioContext)return;
    const start=audioContext.currentTime+delay;
    const oscillator=audioContext.createOscillator();
    const gain=audioContext.createGain();
    oscillator.type=type;
    oscillator.frequency.setValueAtTime(frequency,start);
    gain.gain.setValueAtTime(.0001,start);
    gain.gain.exponentialRampToValueAtTime(gainValue,start+.02);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start+duration+.04);
  }

  function makeNoiseBuffer(seconds=1.5){
    const frames=Math.max(1,Math.floor(audioContext.sampleRate*seconds));
    const buffer=audioContext.createBuffer(1,frames,audioContext.sampleRate);
    const data=buffer.getChannelData(0);
    let last=0;
    for(let i=0;i<frames;i+=1){
      const white=Math.random()*2-1;
      last=last*.82+white*.18;
      data[i]=last*.7;
    }
    return buffer;
  }

  function playMixClank(){
    if(!mixAudio||settings.muted||!audioContext)return;
    const now=audioContext.currentTime;
    const hit=audioContext.createGain();
    hit.gain.setValueAtTime(.0001,now);
    hit.gain.exponentialRampToValueAtTime(.055,now+.006);
    hit.gain.exponentialRampToValueAtTime(.0001,now+.115);
    hit.connect(mixAudio.master);

    const low=audioContext.createOscillator();
    low.type='triangle';
    low.frequency.setValueAtTime(220+Math.random()*70,now);
    low.frequency.exponentialRampToValueAtTime(95+Math.random()*35,now+.11);
    low.connect(hit);

    const high=audioContext.createOscillator();
    high.type='sine';
    high.frequency.setValueAtTime(720+Math.random()*260,now);
    high.frequency.exponentialRampToValueAtTime(310+Math.random()*90,now+.075);
    const highGain=audioContext.createGain();
    highGain.gain.value=.38;
    high.connect(highGain).connect(hit);

    low.start(now); high.start(now);
    low.stop(now+.13); high.stop(now+.1);
  }

  function queueClank(){
    clearTimeout(clankTimer);
    if(!mixAudio||mixAudio.fading||settings.muted)return;
    const delay=260+Math.random()*430;
    clankTimer=setTimeout(()=>{
      playMixClank();
      queueClank();
    },delay);
  }

  function startMixingAudio(){
    if(settings.muted)return;
    unlockAudio();
    if(!audioContext)return;
    stopMixingAudio(0);

    const now=audioContext.currentTime;
    const master=audioContext.createGain();
    master.gain.setValueAtTime(.0001,now);
    master.gain.exponentialRampToValueAtTime(.72,now+.18);
    master.connect(audioContext.destination);

    const noise=audioContext.createBufferSource();
    noise.buffer=makeNoiseBuffer(1.6);
    noise.loop=true;

    const lowpass=audioContext.createBiquadFilter();
    lowpass.type='lowpass';
    lowpass.frequency.value=780;
    lowpass.Q.value=.7;

    const waterGain=audioContext.createGain();
    waterGain.gain.value=.038;

    const lfo=audioContext.createOscillator();
    lfo.type='sine';
    lfo.frequency.value=.72;
    const lfoGain=audioContext.createGain();
    lfoGain.gain.value=.016;
    lfo.connect(lfoGain).connect(waterGain.gain);

    const shimmer=audioContext.createBiquadFilter();
    shimmer.type='bandpass';
    shimmer.frequency.value=1250;
    shimmer.Q.value=.45;
    const shimmerGain=audioContext.createGain();
    shimmerGain.gain.value=.011;

    noise.connect(lowpass).connect(waterGain).connect(master);
    noise.connect(shimmer).connect(shimmerGain).connect(master);
    noise.start(now);
    lfo.start(now);

    mixAudio={master,noise,lfo,fading:false};
    playMixClank();
    queueClank();
  }

  function fadeMixingAudio(seconds=1.55){
    clearTimeout(clankTimer);
    clankTimer=null;
    if(!mixAudio||!audioContext)return;
    mixAudio.fading=true;
    const active=mixAudio;
    const now=audioContext.currentTime;
    active.master.gain.cancelScheduledValues(now);
    active.master.gain.setValueAtTime(Math.max(.001,active.master.gain.value||.72),now);
    active.master.gain.exponentialRampToValueAtTime(.0001,now+seconds);
    clearTimeout(audioStopTimer);
    audioStopTimer=setTimeout(()=>{
      if(mixAudio===active)stopMixingAudio(0);
    },Math.ceil(seconds*1000)+80);
  }

  function stopMixingAudio(){
    clearTimeout(clankTimer);
    clearTimeout(audioStopTimer);
    clankTimer=null;
    audioStopTimer=null;
    if(!mixAudio)return;
    try{mixAudio.noise.stop();}catch{}
    try{mixAudio.lfo.stop();}catch{}
    try{mixAudio.master.disconnect();}catch{}
    mixAudio=null;
  }

  function finishShakeSetup(){
    if(shakeEnabled)return;
    window.addEventListener('devicemotion',handleDeviceMotion,{passive:true});
    shakeEnabled=true;
    els.permissionGate.hidden=true;
    els.statusText.textContent='Shake is ready! Think of a question and shake your iPad.';
    els.motionHelp.textContent='Shake your iPad whenever you want a new answer.';
    playTone(660,.16,.025,'sine');
  }

  async function enableShake(){
    unlockAudio();

    if(!('DeviceMotionEvent'in window)){
      els.permissionNote.textContent='This device does not report motion sensor data.';
      els.permissionButton.disabled=true;
      els.statusText.textContent='Shake is not available on this device.';
      return;
    }

    try{
      if(typeof DeviceMotionEvent.requestPermission==='function'){
        const permission=await DeviceMotionEvent.requestPermission();
        if(permission!=='granted'){
          els.permissionNote.textContent='Motion access was not allowed. Tap Enable Shake to try again.';
          els.statusText.textContent='Shake permission is needed to use the Magic 8 Ball.';
          return;
        }
      }
      finishShakeSetup();
    }catch(error){
      console.warn('Motion permission error:',error);
      els.permissionNote.textContent='Tap Enable Shake again. Safari requires a direct tap to request motion access.';
      els.statusText.textContent='Shake permission is needed to use the Magic 8 Ball.';
    }
  }

  function requestShakeOnLoad(){
    // Browsers that do not require a permission gesture can start immediately.
    if('DeviceMotionEvent'in window && typeof DeviceMotionEvent.requestPermission!=='function'){
      finishShakeSetup();
      return;
    }

    // iOS requires requestPermission() to be called from a user gesture,
    // so show this gate immediately when the page appears.
    els.permissionGate.hidden=false;
  }

  function handleDeviceMotion(event){if(!shakeEnabled||busy)return;const acceleration=event.accelerationIncludingGravity||event.acceleration;if(!acceleration)return;const x=Number(acceleration.x)||0,y=Number(acceleration.y)||0,z=Number(acceleration.z)||0;const magnitude=Math.sqrt(x*x+y*y+z*z);const adjusted=Math.abs(magnitude-9.81);const now=Date.now();if(adjusted>=SHAKE_THRESHOLD&&now-lastShakeAt>SHAKE_COOLDOWN_MS){lastShakeAt=now;askMagicEightBall('shake');}}

  function toggleLearningPanel(){const open=els.learningToggle.getAttribute('aria-expanded')!=='true';els.learningToggle.setAttribute('aria-expanded',String(open));els.learningPanel.hidden=!open;els.learningToggleLabel.textContent=open?'🔬 CLOSE THE MAGIC LAB':'🔬 OPEN THE MAGIC LAB';}
  function addAnswer(){if(settings.answers.length>=MAX_ANSWERS)return;settings.answers.push({text:'New answer!',group:'maybe'});settings.threshold=Math.min(settings.threshold,settings.answers.length-1);saveSettings();render();}
  function deleteAnswer(index){if(settings.answers.length<=MIN_ANSWERS)return;settings.answers.splice(index,1);settings.threshold=Math.min(settings.threshold,settings.answers.length-1);saveSettings();render();}

  function resetDefaults(){const ok=window.confirm('Reset all answers and Magic Lab settings back to the originals?');if(!ok)return;stopMixingAudio(0);clearTimeout(revealTimer);clearTimeout(finishTimer);busy=false;settings=cloneDefaults();saveSettings();els.ball.classList.remove('is-mixing','is-revealed');els.answerText.style.fontSize='';els.answerText.style.lineHeight='';els.answerText.textContent='';els.lastRandomNumber.textContent='—';els.traceBox.innerHTML='<div><span>RANDOM</span><strong>—</strong></div><div class="trace-arrow">↓</div><div><span>RULE</span><strong>Shake your iPad</strong></div><div class="trace-arrow">↓</div><div><span>ANSWER</span><strong>—</strong></div>';render();els.statusText.textContent='Defaults restored. Think of a question!';}
  function openHint(key){const hint=hints[key];if(!hint)return;els.hintIcon.textContent=hint.icon;els.hintTitle.textContent=hint.title;els.hintText.textContent=hint.text;if(typeof els.hintDialog.showModal==='function')els.hintDialog.showModal();else window.alert(`${hint.title}\n\n${hint.text}`);}

  els.permissionButton.addEventListener('click',enableShake);els.learningToggle.addEventListener('click',toggleLearningPanel);els.addAnswerButton.addEventListener('click',addAnswer);els.resetButton.addEventListener('click',resetDefaults);
  els.soundToggle.addEventListener('click',()=>{settings.muted=!settings.muted;saveSettings();renderSoundButton();if(settings.muted){stopMixingAudio(0);}else{unlockAudio();playTone(600,.16,.02,'sine');}});
  els.operatorSelect.addEventListener('change',()=>{settings.operator=els.operatorSelect.value;saveSettings();validateRule();});
  els.thresholdInput.addEventListener('change',()=>{settings.threshold=Math.round(clampNumber(els.thresholdInput.value,0,settings.answers.length-1,0));els.thresholdInput.value=settings.threshold;saveSettings();});
  els.thenGroupSelect.addEventListener('change',()=>{settings.thenGroup=els.thenGroupSelect.value;saveSettings();validateRule();});
  els.revealSeconds.addEventListener('change',()=>{settings.revealSeconds=clampNumber(els.revealSeconds.value,1,10,4);els.revealSeconds.value=settings.revealSeconds;saveSettings();});
  document.querySelectorAll('[data-hint]').forEach((button)=>button.addEventListener('click',()=>openHint(button.dataset.hint)));
  document.addEventListener('pointerdown',unlockAudio,{once:true,passive:true});

  if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js').catch((error)=>console.warn('Service worker:',error)));}
  render();
  requestShakeOnLoad();
})();
