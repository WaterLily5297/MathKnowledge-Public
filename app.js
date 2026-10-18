'use strict';
const $=id=>document.getElementById(id);
const types={'book':'Books & lectures','journal-article':'Research papers','errata':'Corrections','software':'Software','project':'Projects','dataset':'Datasets','reference':'References'};
const languages={en:'English',zh:'Chinese',ja:'Japanese',fr:'French',de:'German',it:'Italian',es:'Spanish',pt:'Portuguese',ru:'Russian',und:'Unspecified',mul:'Multiple languages',la:'Latin'};
const size=30;
let data, page=1;
const element=(tag,content,className)=>{const node=document.createElement(tag);if(content!==undefined)node.textContent=content;if(className)node.className=className;return node;};
function option(select,value,label){const node=element('option',label);node.value=value;select.append(node);}
function render(){
 const query=$('query').value.trim().toLocaleLowerCase('en');
 const subject=$('subject').value,kind=$('type').value,language=$('language').value;
 const rows=data.items.filter(row=>(!subject||row.subjects.includes(subject))&&(!kind||row.type===kind)&&(!language||row.language===language)&&(!query||[row.title,row.authors,row.year,...row.subjects.map(s=>data.labels.get(s)||s)].join(' ').toLocaleLowerCase('en').includes(query)));
 const pages=Math.max(1,Math.ceil(rows.length/size));page=Math.max(1,Math.min(page,pages));
 $('result-count').textContent=rows.length.toLocaleString('en')+' matching '+(rows.length===1?'source':'sources');
 $('results').replaceChildren();
 for(const row of rows.slice((page-1)*size,page*size)){
  const article=element('article',undefined,'resource');
  article.append(element('p',[types[row.type]||'Source',row.year,languages[row.language]||row.language].filter(Boolean).join(' · '),'resource-meta'),element('h3',row.title),element('p',row.authors,'author'));
  const tags=element('div',undefined,'tags');for(const id of row.subjects)tags.append(element('span',data.labels.get(id)||id,'tag'));article.append(tags);
  const link=element('a','Visit original source ↗','source-link');link.href=row.source;link.target='_blank';link.rel='noopener noreferrer';article.append(link);$('results').append(article);
 }
 if(!rows.length)$('results').append(element('p','No sources match. Try another term or reset the filters.','empty'));
 $('results').setAttribute('aria-busy','false');$('page-label').textContent='Page '+page+' of '+pages;
 $('previous').disabled=page===1;$('next').disabled=page===pages;
}
async function start(){
 try{
  const response=await fetch('catalog.json',{cache:'no-cache'});if(!response.ok)throw Error('Catalog unavailable');
  data=await response.json();if(data.schema!==1||!Array.isArray(data.items)||!Array.isArray(data.subjects))throw Error('Invalid catalog');
  data.labels=new Map(data.subjects.map(s=>[s.id,s.label]));
  $('total').textContent=data.items.length.toLocaleString('en');$('updated').textContent='CATALOG UPDATED '+data.updated;
  for(const subject of data.subjects)option($('subject'),subject.id,subject.label);
  for(const type of [...new Set(data.items.map(r=>r.type))].sort())option($('type'),type,types[type]||type);
  for(const language of [...new Set(data.items.map(r=>r.language))].sort())option($('language'),language,languages[language]||language);
  $('filters').addEventListener('submit',e=>e.preventDefault());
  for(const id of ['query','subject','type','language'])$(id).addEventListener(id==='query'?'input':'change',()=>{page=1;render();});
  $('clear').addEventListener('click',()=>{$('filters').reset();page=1;render();$('query').focus();});
  $('previous').addEventListener('click',()=>{page--;render();$('catalog-title').scrollIntoView();});
  $('next').addEventListener('click',()=>{page++;render();$('catalog-title').scrollIntoView();});
  render();
 }catch(error){$('result-count').textContent='The catalog could not be loaded. Please refresh and try again.';$('results').setAttribute('aria-busy','false');}
}
start();
