/* Visual geography only. Road lengths, learning, physics and scoring stay in the engines. */
(function(root){
  'use strict';
  const NS='http://www.w3.org/2000/svg', $=id=>document.getElementById(id);
  const points={S:[102,254],W:[330,249],X:[568,241],Y:[807,254],G:[1090,249],
    U:[330,94],V:[568,96],T:[807,91],L:[330,408],M:[568,406],N:[807,411]};
  const bends=[-17,-25,30,15,-17,17,-15,17,-15,17,16,-17,-20,13,-17,-23,26,15];
  const artwork={
    'Лесники':'h1','Метеостанция':'robot/weather-station.png','Связисты':'robot/radio-station.png','Дальний лагерь':'camp',
    'Геологи':'h4','Смотрители':'h0','Альпинисты':'camp','Спасатели':'clinic',
    'Причал':'robot/dock.png','Биологи':'h1','Озёрный лагерь':'camp'
  };
  function element(tag,attrs={},text){const e=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;}
  function point(id){return points[id]||[0,0];}
  function geometry(edge){
    const a=point(edge.a),b=point(edge.b),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),bend=bends[edge.id]||0;
    const nx=-dy/length*bend,ny=dx/length*bend;
    return `M${a[0]},${a[1]} C${a[0]+dx/3+nx},${a[1]+dy/3+ny} ${b[0]-dx/3+nx},${b[1]-dy/3+ny} ${b[0]},${b[1]}`;
  }
  function position(observation){
    if(!observation)return point('S');
    const path=$('roads').querySelector(`[data-edge="${observation.edge}"] .road-surface`);
    if(!path)return point(observation.from);
    const forward=path.dataset.from===observation.from,f=Math.max(0,Math.min(1,forward?observation.fraction:1-observation.fraction));
    const p=path.getPointAtLength(path.getTotalLength()*f);return [p.x,p.y];
  }
  function during(map,observation,progress){
    const edge=map.edges.find(e=>e.id===observation.edge);
    return position({...observation,fraction:observation.fraction-(1-progress)/edge.length});
  }
  function pathFor(map,route){
    const sections=[];
    for(let i=1;i<route.length;i++){
      const e=map.edges.find(e=>e.a===route[i-1]&&e.b===route[i]||e.b===route[i-1]&&e.a===route[i]);
      if(!e)continue;
      const a=point(e.a),b=point(e.b),dx=b[0]-a[0],dy=b[1]-a[1],distance=Math.hypot(dx,dy),bend=bends[e.id]||0;
      const n=[-dy/distance*bend,dx/distance*bend],c1=[a[0]+dx/3+n[0],a[1]+dy/3+n[1]],c2=[b[0]-dx/3+n[0],b[1]-dy/3+n[1]];
      const forward=e.a===route[i-1],start=forward?a:b,end=forward?b:a,first=forward?c1:c2,second=forward?c2:c1;
      sections.push(`${i===1?'M'+start.join(','):''} C${first.join(',')} ${second.join(',')} ${end.join(',')}`);
    }
    return sections.join(' ');
  }
  function trace(observations){
    const samples=[point('S')];
    for(let i=0;i<observations.length;i++){
      const o=observations[i],previous=observations[i-1],start=previous?.edge===o.edge&&previous.from===o.from?previous.fraction:0;
      for(let f=start+.04;f<o.fraction;f+=.04)samples.push(position({...o,fraction:f}));
      samples.push(position(o));
    }
    return samples.map(p=>p.join(',')).join(' ');
  }
  function textures(){
    for(const type of ['road','mud','water','gravel','sand','hill']){
      const pattern=$('texture-'+type);pattern.setAttribute('width','64');pattern.setAttribute('height','64');
      const fallback=pattern.querySelector('rect').getAttribute('fill');
      const image=type==='road'?element('image',{href:'assets/terrain/materials.webp',x:-64,y:0,width:192,height:192}):element('image',{href:'assets/terrain/'+type+'.svg',width:64,height:64});
      pattern.replaceChildren(element('rect',{width:64,height:64,fill:fallback}),image);
    }
    const water=element('pattern',{id:'scenicWater',width:128,height:128,patternUnits:'userSpaceOnUse'});
    water.append(element('rect',{width:128,height:128,fill:'#4a939a'}),element('image',{href:'assets/terrain/materials.webp',x:-256,y:-128,width:384,height:384}));
    $('routeMap').querySelector('defs').append(water);
  }
  function scenery(round,lab){
    const layer=$('mapDecor');layer.replaceChildren();
    // These biomes are decoration, never an input to the learner or a change in road physics.
    if(!lab&&round===1){
      for(const [x,y,scale]of [[185,43,1.1],[436,38,.7],[690,445,.8],[993,411,1.15]]){
        const rock=element('g',{transform:`translate(${x} ${y}) scale(${scale})`,class:'map-rock'});
        rock.append(element('ellipse',{cy:18,rx:32,ry:9,fill:'#28433c',opacity:'.25'}),element('path',{d:'M-30 15-18-12 4-25 27-8 35 15Z',fill:'#a5aba0',stroke:'#627467','stroke-width':2}),element('path',{d:'M-18-12 4-25 1 13M4-25 27-8 1 13',fill:'none',stroke:'#d3d5c2','stroke-width':2}));layer.append(rock);
      }
    }else if(!lab&&round===2){
      const pond=element('g',{class:'map-pond'});
      pond.append(element('path',{d:'M994 68Q1060 32 1150 69Q1200 100 1163 148Q1100 166 1024 127Q978 106 994 68Z',fill:'url(#scenicWater)',stroke:'#b4ac77','stroke-width':4}));layer.append(pond);
    }
  }
  function stop(id,title,order,lab,onNode){
    const [x,y]=point(id),building=id==='S'||order||id==='G';
    const g=element('g',{class:'junction'+(order?' order-node':'')+(building?' location':' road-junction'),transform:`translate(${x} ${y})`,'data-node':id,tabindex:0,role:'button','aria-label':lab?title+' — добавить в опыт':order?order.title+' — '+order.stars+' звёзд, выбрать заказ':title+' — развилка'});
    g.append(element('title',{},lab?title+' · добавить соседний пункт в маршрут':order?order.title+' · '+order.size+' места · '+order.stars+' звёзд':title));
    if(building){
      const size=id==='S'?104:92;
      g.append(element('ellipse',{class:'location-pad',cx:0,cy:4,rx:size/2+3,ry:18}),element('rect',{class:'location-hit',x:-size/2-7,y:-77,width:size+14,height:123,rx:14,fill:'transparent'}));
      const fallback=element('g',{class:'building-fallback'});fallback.append(element('path',{d:'M-29-8V-43L0-63 29-43V-8Z',fill:'#ede3bd',stroke:'#766c50','stroke-width':3}),element('path',{d:'M-34-43 0-69 34-43',fill:'none',stroke:'#a46d50','stroke-width':9}),element('rect',{x:-7,y:-30,width:14,height:22,fill:'#416658'}));g.append(fallback);
      const asset=id==='S'?'clinic':order?(artwork[order.title]||'h0'):'camp';
      const href=asset==='camp'?'assets/robot/rescue-camp.png':asset.includes('/')?'assets/'+asset:'assets/buildings/'+asset+'.webp';
      const image=element('image',{class:'location-building',href,x:-size/2,y:-77,width:size,height:92,preserveAspectRatio:'xMidYMax meet','aria-hidden':true});
      image.onload=()=>fallback.remove();image.onerror=()=>image.remove();g.append(image);
      if(order){
        g.append(element('path',{class:'delivery-flag',d:'M37-58v34',stroke:'#695742','stroke-width':3}),element('rect',{class:'delivery-tag',x:17,y:-68,width:44,height:28,rx:6}),element('path',{class:'delivery-kit',d:'M27-62v11M21.5-56.5h11'}),element('text',{class:'delivery-code',x:46,y:-52},order.code),element('path',{class:'delivery-check',d:'m24-51 6 6 13-14'}));
      }else if(id==='S'){
        g.append(element('rect',{class:'base-sign',x:-26,y:9,width:52,height:24,rx:6}),element('text',{class:'base-sign-text',y:21},'БАЗА'));
      }
      const name=order?order.title:title,nameY=y<140?-76:57;
      g.append(element('text',{class:'node-name',y:nameY},name));
    }else{
      g.append(element('ellipse',{class:'junction-disc',rx:22,ry:14}),element('circle',{class:'junction-hit',r:33,fill:'transparent'}),element('path',{class:'sign-pole',d:'M26-8v-35'}),element('path',{class:'junction-sign',d:'M8-57H40L47-43 40-29H8Z'}),element('text',{class:'junction-letter',x:26,y:-43},title));
    }
    g.onclick=()=>onNode(id);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onNode(id);}};return g;
  }
  function draw(map,{lab,round,terrains,onRoad,onNode}){
    $('roads').replaceChildren();$('roadLabels').replaceChildren();scenery(round,lab);
    for(const e of map.edges){
      const d=geometry(e),group=element('g',{'data-edge':e.id,class:'road-group road-'+e.type,tabindex:0,role:'button','aria-label':terrains[e.type].name+', длина '+e.length+'. О покрытии'});
      group.append(element('title',{},terrains[e.type].name+' · длина '+e.length+' · нажми, чтобы изучить'),element('path',{d,class:'road-shadow'}),element('path',{d,class:'road-border'}));
      if(e.type==='water')group.append(element('path',{d,class:'ford-bank'}));
      const path=element('path',{d,class:'road-surface',stroke:`url(#texture-${e.type})`,'data-from':e.a});group.append(path);
      if(e.type==='road')group.append(element('path',{d,class:'road-marking'}));
      if(e.type==='hill')group.append(element('path',{d,class:'hill-contour'}));
      group.onclick=()=>onRoad(e.type);group.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();onRoad(e.type);}};$('roads').append(group);
      const p=path.getPointAtLength(path.getTotalLength()*.51),label=element('g',{class:'road-label',transform:`translate(${p.x} ${p.y})`,'aria-hidden':true});
      label.append(element('rect',{x:-16,y:-13,width:32,height:26,rx:7}),element('text',{y:1},String(e.length)));$('roadLabels').append(label);
    }
    $('junctions').replaceChildren(...Object.entries(map.nodes).map(([id,[,,title]])=>stop(id,title,map.orders?.find(o=>o.node===id),lab,onNode)));
    // Depth follows the scenery: roads < buildings < labels < moving robot.
    $('terrainLegend').replaceChildren(...Object.entries(terrains).map(([type,t])=>{const b=document.createElement('button');b.className='terrain-key';b.dataset.terrain=type;b.setAttribute('aria-label',t.name+' — свойства');const swatch=element('svg',{viewBox:'0 0 30 24','aria-hidden':true});swatch.append(element('rect',{width:30,height:24,fill:`url(#texture-${type})`}));b.append(swatch,document.createTextNode(t.name));b.onclick=()=>onRoad(type);return b;}));
  }
  root.RobotMap={point,geometry,position,during,pathFor,trace,draw,textures};
})(typeof window!=='undefined'?window:globalThis);
