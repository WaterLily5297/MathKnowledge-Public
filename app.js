'use strict';
const $=id=>document.getElementById(id);
const types={'book':"\u6559\u6750\u4e0e\u8bb2\u4e49",'journal-article':"\u7814\u7a76\u8bba\u6587",'errata':"\u52d8\u8bef",'software':"\u8f6f\u4ef6",'project':"\u9879\u76ee",'dataset':"\u6570\u636e\u96c6",'reference':"\u53c2\u8003\u8d44\u6599"};
const languages={en:"\u82f1\u8bed",zh:"\u4e2d\u6587",ja:"\u65e5\u8bed",fr:"\u6cd5\u8bed",de:"\u5fb7\u8bed",it:"\u610f\u5927\u5229\u8bed",es:"\u897f\u73ed\u7259\u8bed",pt:"\u8461\u8404\u7259\u8bed",ru:"\u4fc4\u8bed",und:"\u672a\u6ce8\u660e",mul:"\u591a\u79cd\u8bed\u8a00",la:"\u62c9\u4e01\u8bed"};
const subjectLabels={"Foundations and logic":"\u57fa\u7840\u4e0e\u903b\u8f91","Linear algebra":"\u7ebf\u6027\u4ee3\u6570","Analysis":"\u5206\u6790\u5b66","Differential equations and dynamics":"\u5fae\u5206\u65b9\u7a0b\u4e0e\u52a8\u529b\u7cfb\u7edf","Algebra and representation theory":"\u4ee3\u6570\u4e0e\u8868\u793a\u8bba","Number theory":"\u6570\u8bba","Algebraic geometry":"\u4ee3\u6570\u51e0\u4f55","Geometry":"\u51e0\u4f55\u5b66","Topology":"\u62d3\u6251\u5b66","Probability and stochastic processes":"\u6982\u7387\u4e0e\u968f\u673a\u8fc7\u7a0b","Statistics and machine learning":"\u7edf\u8ba1\u4e0e\u673a\u5668\u5b66\u4e60","Discrete mathematics and combinatorics":"\u79bb\u6563\u6570\u5b66\u4e0e\u7ec4\u5408","Applied and computational mathematics":"\u5e94\u7528\u4e0e\u8ba1\u7b97\u6570\u5b66"};
const size=30;
let data, page=1;
const element=(tag,content,className)=>{const node=document.createElement(tag);if(content!==undefined)node.textContent=content;if(className)node.className=className;return node;};
function option(select,value,label){const node=element('option',label);node.value=value;select.append(node);}
function render(){
 const query=$('query').value.trim().toLocaleLowerCase('en');
 const subject=$('subject').value,kind=$('type').value,language=$('language').value;
 const rows=data.items.filter(row=>(!subject||row.subjects.includes(subject))&&(!kind||row.type===kind)&&(!language||row.language===language)&&(!query||[row.title,row.authors,row.year,...row.subjects.map(s=>data.labels.get(s)||s)].join(' ').toLocaleLowerCase('en').includes(query)));
 const pages=Math.max(1,Math.ceil(rows.length/size));page=Math.max(1,Math.min(page,pages));
 $('result-count').textContent=rows.length.toLocaleString('zh-CN')+" \u9879\u5339\u914d"+"\u8d44\u6599";
 $('results').replaceChildren();
 for(const row of rows.slice((page-1)*size,page*size)){
  const article=element('article',undefined,'resource');
  article.append(element('p',[types[row.type]||"\u8d44\u6599",row.year,languages[row.language]||row.language].filter(Boolean).join(' \u00b7 '),'resource-meta'),element('h3',row.title),element('p',row.authors,'author'));
  const tags=element('div',undefined,'tags');for(const id of row.subjects)tags.append(element('span',data.labels.get(id)||id,'tag'));article.append(tags);
  const link=element('a',"\u8bbf\u95ee\u539f\u59cb\u6765\u6e90 \u2197",'source-link');link.href=row.source;link.target='_blank';link.rel='noopener noreferrer';article.append(link);$('results').append(article);
 }
 if(!rows.length)$('results').append(element('p',"\u6ca1\u6709\u5339\u914d\u8d44\u6599\uff0c\u8bf7\u66f4\u6362\u5173\u952e\u8bcd\u6216\u91cd\u7f6e\u7b5b\u9009\u3002",'empty'));
 $('results').setAttribute('aria-busy','false');$('page-label').textContent="\u7b2c "+page+" / "+pages+" \u9875";
 $('previous').disabled=page===1;$('next').disabled=page===pages;
}
async function start(){
 try{
  const response=await fetch('catalog.json',{cache:'no-cache'});if(!response.ok)throw Error("\u76ee\u5f55\u6682\u65f6\u4e0d\u53ef\u7528");
  data=await response.json();if(data.schema!==1||!Array.isArray(data.items)||!Array.isArray(data.subjects))throw Error("\u76ee\u5f55\u683c\u5f0f\u4e0d\u6b63\u786e");
  data.labels=new Map(data.subjects.map(s=>[s.id,subjectLabels[s.label]||s.label]));
  $('total').textContent=data.items.length.toLocaleString('zh-CN');$('updated').textContent="\u76ee\u5f55\u66f4\u65b0\uff1a"+data.updated;
  for(const subject of data.subjects)option($('subject'),subject.id,data.labels.get(subject.id));
  for(const type of [...new Set(data.items.map(r=>r.type))].sort())option($('type'),type,types[type]||type);
  for(const language of [...new Set(data.items.map(r=>r.language))].sort())option($('language'),language,languages[language]||language);
  $('filters').addEventListener('submit',e=>e.preventDefault());
  for(const id of ['query','subject','type','language'])$(id).addEventListener(id==='query'?'input':'change',()=>{page=1;render();});
  $('clear').addEventListener('click',()=>{$('filters').reset();page=1;render();$('query').focus();});
  $('previous').addEventListener('click',()=>{page--;render();$('catalog-title').scrollIntoView();});
  $('next').addEventListener('click',()=>{page++;render();$('catalog-title').scrollIntoView();});
  render();
 }catch(error){$('result-count').textContent="\u76ee\u5f55\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u540e\u91cd\u8bd5\u3002";$('results').setAttribute('aria-busy','false');}
}
start();
