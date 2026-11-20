(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ContinuousFaceScan=api;})(globalThis,function(){
  'use strict';
  const phases=['front','left','right','up','down','finish'];
  const labels={front:'正面を向いてください',left:'表情を変えず、顔をゆっくり左へ向けてください',right:'正面を通り、顔をゆっくり右へ向けてください',up:'正面に戻して、顔をゆっくり少し上へ向けてください',down:'顔をゆっくり少し下へ向けてください',finish:'正面に戻してください'};
  function create({minFrames=18,maxFrames=48}={}){
    const frames=new Map();let front=null,index=0,yawSign=0,pitchSign=0,started=null,closed=false;
    function status(hint){return {phase:phases[index],count:frames.size,progress:Math.min(99,Math.round(index/6*100)),hint:hint||labels[phases[index]],completed:false};}
    function add(frame,now=Date.now()){
      if(closed)return status('撮影は終了しています。');
      started??=now;
      if(now-started>120000)return {...status('時間内に撮影できませんでした。閉じてから再試行してください。'),expired:true};
      const a=frame?.analysis,m=a?.metrics;
      if(!a?.ok||a.landmarks?.length<468||!m||!a.landmarks.slice(0,468).every(p=>[p.x,p.y,p.z??0].every(Number.isFinite)))return status('顔をガイド内に戻してください。');
      if(![m.yawRatio,m.pitchRatio,m.eyeTiltDegrees,m.frameCenterOffsetX,m.frameCenterOffsetY,m.faceWidthInFrame].every(Number.isFinite))return status('顔の向きを確認しています。');
      if(Math.abs(m.frameCenterOffsetX)>18||Math.abs(m.frameCenterOffsetY)>24)return status('顔をガイドの中央へ移動してください。');
      if(m.faceWidthInFrame<22||m.faceWidthInFrame>72)return status('顔全体が入る距離に調整してください。');
      if(Math.abs(m.eyeTiltDegrees)>12)return status('頭を横に傾けず、首をゆっくり回してください。');
      if(front&&Math.abs(m.faceWidthInFrame/front.analysis.metrics.faceWidthInFrame-1)>.35)return status('カメラとの距離を保ってください。');
      if(!front){if(Math.abs(m.yawRatio)>10)return status();front=frame;frames.set('front',frame);index=1;return status();}
      const yaw=m.yawRatio-front.analysis.metrics.yawRatio,pitch=m.pitchRatio-front.analysis.metrics.pitchRatio;
      if(!yawSign&&Math.abs(yaw)>=6)yawSign=Math.sign(yaw);
      if(index>=3&&!pitchSign&&Math.abs(yaw)<12&&Math.abs(pitch)>=3)pitchSign=Math.sign(pitch);
      const side=index===1||index===2;
      const key=side?`yaw-${Math.round(yaw/3)}`:`pitch-${Math.round(pitch/2)}`;
      const useful=side
        ? Math.abs(yaw)>=3&&Math.abs(pitch)<10&&(index===1?yaw*yawSign>0:yaw*yawSign<0)
        : index<5&&Math.abs(yaw)<12&&Math.abs(pitch)>=2;
      // Keep one frame per small pose cell; stationary frames do not increase coverage.
      if(useful&&!frames.has(key)&&frames.size<maxFrames&&Math.abs(yaw)<=48&&Math.abs(pitch)<=25)frames.set(key,frame);
      const offsets=[...frames.values()].map(f=>({yaw:(f.analysis.metrics.yawRatio-front.analysis.metrics.yawRatio)*yawSign,pitch:(f.analysis.metrics.pitchRatio-front.analysis.metrics.pitchRatio)*pitchSign}));
      const left=offsets.filter(p=>p.yaw>=6),right=offsets.filter(p=>p.yaw<=-6),up=offsets.filter(p=>Math.abs(p.yaw)<12&&p.pitch>=3),down=offsets.filter(p=>Math.abs(p.yaw)<12&&p.pitch<=-3);
      if(index===1&&left.length>=6&&left.some(p=>p.yaw>=24))index=2;
      if(index===2&&right.length>=6&&right.some(p=>p.yaw<=-24))index=3;
      if(index===3&&up.length>=3&&up.some(p=>p.pitch>=6))index=4;
      if(index===4&&down.length>=3&&down.some(p=>p.pitch<=-6))index=5;
      if(index===5&&Math.abs(yaw)<7&&Math.abs(pitch)<5&&frames.size>=minFrames){closed=true;return {...status('連続撮影が完了しました。3Dモデルを作成します。'),completed:true,progress:100};}
      if(index===5&&frames.size<minFrames)return status('もう少しゆっくり左右へ動かしてから正面に戻ってください。');
      return status();
    }
    function views(){return Object.fromEntries(frames);}
    function clear(){frames.clear();front=null;closed=true;}
    return {add,views,clear,status};
  }
  return {create};
});
