import * as THREE from 'three';
import { STONES } from './config.js';

const TYPES=['mars','moon','meteorite','lava','nebula','aurora','blackhole','stardust','iceplanet','plasma'];
const common=/* glsl */`
  varying vec3 vCosmicPosition;
  varying vec3 vCosmicRay;
  uniform vec3 uCosmicSize;
  uniform float uCosmicTime;
  uniform int uCosmicType;
  uniform int uCosmicFinish;
  float chash(vec3 p){p=fract(p*.3183099+vec3(.13,.71,.39));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
  vec3 chash3(vec3 p){return vec3(chash(p),chash(p+13.4),chash(p+37.1));}
  float cnoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(chash(i),chash(i+vec3(1,0,0)),f.x),mix(chash(i+vec3(0,1,0)),chash(i+vec3(1,1,0)),f.x),f.y),mix(mix(chash(i+vec3(0,0,1)),chash(i+vec3(1,0,1)),f.x),mix(chash(i+vec3(0,1,1)),chash(i+vec3(1,1,1)),f.x),f.y),f.z);}
  float cfbm(vec3 p){float a=.5,f=0.;for(int i=0;i<4;i++){f+=a*cnoise(p);p=p*2.07+vec3(5.7,3.1,1.2);a*=.5;}return f;}
  mat2 crot(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
  float cells(vec3 p){vec3 ip=floor(p),fp=fract(p);float a=9.,b=9.;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){vec3 g=vec3(float(x),float(y),float(z));vec3 r=g+.2+.6*chash3(ip+g)-fp;float d=dot(r,r);if(d<a){b=a;a=d;}else{b=min(b,d);}}return sqrt(b)-sqrt(a);}
  vec2 crater(vec2 p){vec2 cell=floor(p),f=fract(p);float bowl=0.,rim=0.;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){vec2 g=vec2(float(x),float(y));vec3 seed=chash3(vec3(cell+g,4.));float r=length(g+seed.xy-f);float size=.12+seed.z*.19;bowl+=exp(-pow(r/(size*.7),4.));rim+=exp(-pow((r-size)/(size*.19),2.));}return vec2(bowl,rim);}
  float stars(vec3 p,float time){vec3 i=floor(p),f=fract(p)-.5;vec3 h=chash3(i);float dotStar=exp(-dot(f-h*.38,f-h*.38)*420.);return dotStar*step(.974,h.z)*(1.25+.75*sin(time*.8+h.x*30.));}
  vec3 cosmicSample(vec3 p,vec3 ray,out vec3 glow,out float height){
    glow=vec3(0.);height=0.;float t=uCosmicTime;
    float n=cfbm(p*5.1);vec3 col=vec3(.1);
    if(uCosmicType==0){
      float layers=sin(p.y*30.+cfbm(p*3.)*11.);vec2 c=crater(p.xy*3.4);
      col=mix(vec3(.085,.012,.006),vec3(.42,.095,.025),n);
      col=mix(col,vec3(.51,.17,.055),smoothstep(.68,.95,n)*.7);
      col*=.82+.18*layers;col*=1.-c.x*.36;col+=c.y*vec3(.07,.035,.02);
      col*=.94+.12*cfbm(p*4.+vec3(t*.045,0.,0.));
      height=(cfbm(p*27.)-.5)*.21+c.y*.055-c.x*.065;
    }else if(uCosmicType==1){
      vec2 c=crater(p.xy*3.8),small=crater(p.xy*9.8);
      col=mix(vec3(.13,.15,.18),vec3(.48,.48,.46),n);
      col*=1.-c.x*.43-small.x*.18;col+=c.y*.13+small.y*.045;
      height=(cfbm(p*30.)-.5)*.08+c.y*.095-c.x*.11+small.y*.035;
      glow=stars(p*22.,t)*vec3(.055,.07,.10);
    }else if(uCosmicType==2){
      vec2 q=p.xy*1.3;float a=abs(sin((q.x+q.y*.577)*65.));float b=abs(sin((q.x-q.y*1.732)*49.));
      float lines=smoothstep(.77,.94,max(a,b));
      col=mix(vec3(.12,.14,.18),vec3(.39,.43,.49),n*.7+lines*.3);
      height=(lines-.5)*.014+(cfbm(p*29.)-.5)*.08;
      glow=vec3(.025,.06,.12)*pow(.5+.5*sin(p.y*4.+t*.35),12.)*lines;
    }else if(uCosmicType==3){
      vec3 q=p*3.2;q.y-=t*.055;q.x+=sin(p.y*3.+t*.11)*.12;q+=vec3(cfbm(p*4.),cfbm(p*4.+3.),cfbm(p*4.+8.))*.55;
      float edge=cells(q);float crack=1.-smoothstep(.016,.095,edge);
      float fire=cfbm(q*2.+vec3(0,-t*.32,0));
      col=mix(vec3(.013,.010,.012),vec3(.065,.035,.025),n);
      glow=mix(vec3(1.8,.025,.001),vec3(4.,.7,.025),fire)*crack*(.84+.16*sin(t*.7+q.y*2.));
      height=(cfbm(p*15.)-.5)*.075-crack*.045;
    }else if(uCosmicType==4||uCosmicType==7){
      vec3 cloud=vec3(0.);float starsLight=0.;vec3 r=normalize(ray);
      for(int i=0;i<12;i++){
        float f=float(i)/12.;vec3 q=p+r*f*1.35;q.xy=crot(t*.012+f*.23)*q.xy;q.z+=t*.018;
        float density=cfbm(q*3.9+vec3(4.,0.,1.));
        float band=exp(-pow(q.y*.95+sin(q.x*2.)*.32,2.)*4.);
        float neb=smoothstep(.35,.73,density)*band;
        vec3 hue=mix(vec3(.025,.09,.35),vec3(.46,.045,.31),cfbm(q*2.+8.));
        if(uCosmicType==7)hue=mix(vec3(.018,.04,.13),vec3(.44,.25,.055),density);
        cloud+=hue*neb*.17;
        starsLight+=stars(q*17.,t)*.7;
      }
      col=vec3(.008,.011,.028)+cloud*.3;
      glow=cloud*1.9+vec3(1.,.86,.63)*starsLight*2.4;
    }else if(uCosmicType==5){
      vec3 colour=vec3(0.);float wave=0.;
      for(int i=0;i<6;i++){float f=float(i);float ribbon=p.y+sin(p.x*3.8+t*.16+f*.27)*.22+sin(p.x*7.-t*.12)*.08+f*.11-.34;float band=exp(-abs(ribbon)*16.);colour+=mix(vec3(.025,.95,.35),vec3(.12,.22,.9),f/5.)*band*.23;wave+=band;}
      col=vec3(.006,.025,.045);glow=colour*1.45+stars(p*19.,t)*vec3(.8,.95,1.5);
    }else if(uCosmicType==6){
      vec2 q=p.xy;q.y*=1.65;float r=length(q),angle=atan(q.y,q.x);
      float disk=exp(-pow((r-.48)/.12,2.));float spiral=.55+.45*sin(angle*3.-log(r+.06)*16.-t*.38);
      vec3 fire=mix(vec3(.9,.16,.015),vec3(3.3,1.8,.55),spiral);
      col=vec3(.004,.005,.012);glow=fire*disk*(.8+.2*cfbm(p*20.));
      glow+=vec3(.8,.85,1.)*stars(p*21.,t)*smoothstep(.42,.8,r);
      glow*=smoothstep(.23,.31,r);
    }else if(uCosmicType==8){
      float edge=cells(p*3.3+cfbm(p*5.)*.35);float crack=1.-smoothstep(.008,.055,edge);
      col=mix(vec3(.025,.16,.25),vec3(.22,.62,.7),n);
      col+=vec3(.2,.28,.29)*crack;glow=vec3(.05,.27,.4)*crack*(.85+.15*sin(t*.4+p.y*4.));
      height=(cfbm(p*15.)-.5)*.055-crack*.018;
    }else{
      vec3 q=p;q.xy=crot(t*.07)*q.xy;float warp=cfbm(q*3.+t*.06);
      float veins=abs(sin(q.x*8.+q.y*4.+warp*8.-t*.3));float energy=pow(1.-veins,13.);
      col=vec3(.024,.006,.055);glow=mix(vec3(.45,.02,1.2),vec3(1.9,.5,3.0),n)*energy*2.;
      glow+=vec3(.06,.015,.16)*cfbm(q*6.);
    }
    if(uCosmicFinish==1){col=mix(col,normalize(col+vec3(.02))*.45,.35);glow*=.65;}
    if(uCosmicFinish==2){height*=.12;col=mix(col,col*.65+vec3(.07),.3);}
    if(uCosmicFinish==3){glow*=1.16;height*=.7;}
    return col;
  }
`;

export function createCosmicMaterial(geometry, stoneKey, finish='standard'){
  const stone=STONES[stoneKey];
  const rocky=['mars','moon','meteorite','iceplanet','lava'].includes(stoneKey);
  const material=new THREE.MeshPhysicalMaterial({color:stone.color,roughness:rocky?.68:.14,metalness:stoneKey==='meteorite'?.94:.06,clearcoat:rocky?.08:1,clearcoatRoughness:.08,envMapIntensity:rocky?.85:.65,emissive:'#ffffff',emissiveIntensity:1});
  material.name=stone.name;
  geometry.computeBoundingBox();
  const size=geometry.boundingBox.getSize(new THREE.Vector3());size.z=Math.max(size.z,size.x*.6);
  const uniforms={uCosmicSize:{value:size.multiplyScalar(.5)},uCosmicTime:{value:0},uCosmicType:{value:TYPES.indexOf(stoneKey)},uCosmicFinish:{value:['standard','metalized','glass','highend'].indexOf(finish)}};
  material.cosmicUniforms=uniforms;
  material.userData={isCosmicMaterial:true,stoneKey,mineralKind:'cosmic',finish};
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCosmicPosition;\nvarying vec3 vCosmicRay;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCosmicPosition=position;\nvCosmicRay=position-(inverse(modelMatrix)*vec4(cameraPosition,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+common);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 cosmicGlow;float cosmicHeight;
      vec3 cosmicColor=cosmicSample(vCosmicPosition/uCosmicSize,normalize(vCosmicRay),cosmicGlow,cosmicHeight);
      diffuseColor.rgb=cosmicColor;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance=cosmicGlow;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec3 cq0=dFdx(-vViewPosition),cq1=dFdy(-vViewPosition);
      vec3 cx=cross(cq1,normal),cy=cross(normal,cq0);float cd=dot(cq0,cx);
      normal=normalize(abs(cd)*normal-sign(cd)*(dFdx(cosmicHeight)*cx+dFdy(cosmicHeight)*cy));
    `);
  };
  material.customProgramCacheKey=()=>`emera-cosmic-v1`;
  if(finish==='metalized'){material.metalness=1;material.roughness=.22;material.clearcoat=.7;}
  if(finish==='glass'){material.metalness=0;material.roughness=.035;material.clearcoat=1;material.transmission=.28;material.thickness=size.z*.8;material.ior=1.55;}
  if(finish==='highend'){material.roughness=rocky?.26:.045;material.clearcoat=1;material.clearcoatRoughness=.035;material.envMapIntensity=1;}
  return material;
}

export function tickCosmic(material,time){
  if(material.cosmicUniforms)material.cosmicUniforms.uCosmicTime.value=time;
}
