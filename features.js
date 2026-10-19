'use strict';
window.FormosaFeatures={init(data,helpers){
 const $=id=>document.getElementById(id),el=helpers.element,books=new Map(data.items.map(row=>[row.id,row]));
 const shared=data.shared_pdfs||Object.create(null),dialog=$('book-dialog');let shelf=Object.create(null);
 try{const saved=JSON.parse(localStorage.getItem('formosa-public-shelf')||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))shelf=Object.assign(Object.create(null),saved);}catch(_){}
 const persist=()=>{try{localStorage.setItem('formosa-public-shelf',JSON.stringify(shelf));}catch(_){}};
 function original(id,page=1){const row=books.get(id);if(!row)return el('span','Unavailable');
  const link=el('a',shared[id]?'Read PDF ↗':'Original source ↗');link.href=shared[id]?'read/'+encodeURIComponent(id)+'#page='+page:row.source;link.target='_blank';link.rel='noopener noreferrer';return link;}
 function show(){if(!dialog.open)dialog.showModal();}
 function details(id){const row=books.get(id);if(!row)return;const body=$('book-detail');body.replaceChildren();
  const title=el('h2');window.FormosaReader.renderTitle(title,row.title);body.append(title,el('p',row.authors),el('p',[row.year,row.language,...row.subjects.map(id=>data.labels.get(id)||id)].filter(Boolean).join(' / ')));
  if(shared[id]){const license=shared[id];const note=el('p',license.license);if(license.license_url){const link=el('a','License terms');link.href=license.license_url;link.target='_blank';link.rel='noopener noreferrer';note.append(' - ',link);}body.append(note);}
  const prior=shelf[id]||{},label=el('label','Reading status '),status=el('select');for(const [value,text]of [['want','Want to read'],['reading','Reading'],['done','Finished']]){const option=el('option',text);option.value=value;status.append(option);}status.value=['want','reading','done'].includes(prior.status)?prior.status:'want';label.append(status);
  const pageLabel=el('label','PDF page '),page=el('input');page.type='number';page.min='1';page.max='100000';page.value=Number.isInteger(prior.page)&&prior.page>0&&prior.page<=100000?String(prior.page):'1';pageLabel.append(page);
  const read=original(id,Number(page.value));page.addEventListener('input',()=>{if(shared[id])read.href='read/'+encodeURIComponent(id)+'#page='+Math.max(1,Math.min(100000,Number(page.value)||1));});
  const save=el('button','Save to bookshelf','primary');save.addEventListener('click',()=>{const position=Number(page.value);if(!Number.isInteger(position)||position<1||position>100000)return;shelf[id]={status:status.value,page:position};persist();save.textContent='Saved';renderShelf();});
  body.append(read,el('p'),label,pageLabel,save);show();
 }
 function renderShelf(){$('shelf-items').replaceChildren();let count=0;for(const [id,value]of Object.entries(shelf)){if(!books.has(id)||!value||typeof value!=='object')continue;count++;const card=el('article');card.append(helpers.titleLink(books.get(id)),el('p',({want:'Want to read',reading:'Reading',done:'Finished'})[value.status]||'Saved'));
  const edit=el('button','Update progress','secondary'),remove=el('button','Remove from bookshelf','secondary');edit.addEventListener('click',()=>details(id));remove.addEventListener('click',()=>{delete shelf[id];persist();renderShelf();});card.append(original(id,Number.isInteger(value.page)&&value.page>=1?value.page:1),edit,remove);$('shelf-items').append(card);}if(!count)$('shelf-items').append(el('p','Choose Details / save on a catalog entry to add a book.'));}
 async function readPage(id,page){try{const response=await fetch('page?'+new URLSearchParams({book:id,page:String(page)}),{cache:'no-store'});if(!response.ok)throw Error();const result=await response.json(),body=$('book-detail');body.replaceChildren();if(!result.results.length)body.append(el('p','This page is not available in the text index.'));else{const title=el('h2');window.FormosaReader.renderTitle(title,books.get(id).title);body.append(title,el('p','PDF page '+page+'. Extracted text can lose formulas and layout; check the original PDF.'),original(id,page),el('pre',result.results[0].body,'page-text'));}show();}catch(_){$('fulltext-status').textContent='Could not read the page. The owner may have changed its sharing permission.';}}
 $('close-book').addEventListener('click',()=>dialog.close());
 const active=Object.hasOwn(data,'shared_pdfs');$('search-nav').hidden=!active;
 for(const row of data.items.filter(row=>shared[row.id])){const option=el('option',row.title.replace(/\$/g,'').replace(/\\([A-Za-z]+)/g,'$1'));option.value=row.id;$('fulltext-book').append(option);}
 let request=0;$('fulltext-form').addEventListener('submit',async event=>{event.preventDefault();if(!active)return;const current=++request,query=$('fulltext-query').value.trim();if(!query)return;$('fulltext-status').textContent='Searching shared PDFs...';
  const params=new URLSearchParams({query});if($('fulltext-book').value)params.set('book',$('fulltext-book').value);
  try{const response=await fetch('search?'+params,{cache:'no-store'});if(!response.ok)throw Error();const result=await response.json();if(current!==request)return;$('fulltext-results').replaceChildren();
   if(result.shared_pdfs){for(const key of Object.keys(shared))delete shared[key];Object.assign(shared,result.shared_pdfs);}
   for(const hit of result.results){if(!books.has(hit.book)||!shared[hit.book])continue;const row=books.get(hit.book),card=el('article');card.append(helpers.titleLink(row),el('p',row.authors+' - PDF page '+hit.page),el('blockquote',hit.excerpt),original(hit.book,hit.page));const page=el('button','Read page text','secondary');page.addEventListener('click',()=>readPage(hit.book,hit.page));card.append(page);$('fulltext-results').append(card);}
   $('fulltext-status').textContent=result.results.length+' matching page results. Only currently shared PDFs are searched.';
  }catch(_){if(current===request)$('fulltext-status').textContent='Search is temporarily unavailable. The owner must keep the library and index online.';}});
 const paths=Array.isArray(data.reading_paths)?data.reading_paths:[];$('paths-nav').hidden=!paths.length;
 for(const path of paths){const section=el('section');section.append(el('h2',path.title));for(const step of path.steps){section.append(el('h3',step.title),el('p',step.goal));for(const id of step.books)if(books.has(id)){const line=el('p');line.append(helpers.titleLink(books.get(id)));section.append(line);}}$('reading-paths').append(section);}
 renderShelf();return{details,renderShelf};
}};
