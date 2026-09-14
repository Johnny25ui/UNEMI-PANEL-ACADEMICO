(() => {
  // MVP genérico: detecta enlaces que parezcan actividades de Moodle.
  // Para la versión UNEMI final ajustaremos los selectores a la estructura real del aula.
  const API='http://localhost:3000/api/activities';
  const sent=new Set(JSON.parse(localStorage.getItem('unemiSent')||'[]'));
  const norm=s=>(s||'').replace(/\s+/g,' ').trim();
  function guessType(text){const t=text.toLowerCase();if(/quiz|test|cuestionario|examen/.test(t))return'Test';if(/foro|forum/.test(t))return'Foro';if(/tarea|assignment|deber/.test(t))return'Tarea';return'Actividad';}
  function scan(){
    const candidates=[...document.querySelectorAll('a[href]')].filter(a=>/mod\/(assign|quiz|forum|workshop|lesson)\//i.test(a.getAttribute('href')||''));
    for(const a of candidates){
      const title=norm(a.textContent||a.getAttribute('title')||''); if(!title||title.length<3)continue;
      const url=new URL(a.href,location.href).href; if(sent.has(url))continue;
      const course=norm(document.querySelector('.breadcrumb li:last-child, .page-header-headings h1, h1')?.textContent)||'Curso UNEMI';
      const activity={course,title,type:guessType(title+' '+document.body.innerText.slice(0,3000)),url,source:'Moodle'};
      fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(activity)}).then(r=>{if(r.ok){sent.add(url);localStorage.setItem('unemiSent',JSON.stringify([...sent].slice(-1000)));}}).catch(()=>{});
    }
  }
  scan();setInterval(scan,30000);
})();
