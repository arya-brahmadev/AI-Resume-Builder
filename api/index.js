import express from 'express';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const table = 'resumes';

const fail = (res, message, status = 400) => res.status(status).json({ error: message });
const cleanUrl = (url='') => /^https?:\/\//i.test(url) ? url : `https://${url}`;
const asText = (value) => typeof value === 'string' ? value : JSON.stringify(value ?? '');
const resumeText = (r) => JSON.stringify(r);
function keywordScore(text, keywords) {
  if (!keywords?.length) return 0;
  const s = text.toLowerCase();
  return Math.round(keywords.filter(k => s.includes(k.toLowerCase())).length / keywords.length * 100);
}
async function aiJson(instructions, input, schema) {
  const response = await openai.responses.create({
    model: 'gpt-5-mini',
    instructions,
    input: [{ role: 'user', content: [{ type: 'input_text', text: input }] }],
    text: { format: { type: 'json_schema', name: 'resumate_output', strict: true, schema } },
  });
  return JSON.parse(response.output_text);
}

app.get('/api/_healthcheck', (_req,res) => res.json({ message: 'Resumate backend is running' }));

app.get('/api/resumes', async (_req,res) => {
  const { data, error } = await supabase.from(table).select('*').order('updated_at', { ascending:false }).limit(50);
  if (error) return fail(res, 'Could not load resumes', 500);
  res.json({ resumes: (data || []).map(r => ({ id:r.id, title:r.title, template:r.template, profile:r.profile||{}, experience:r.experience||[], education:r.education||[], skills:r.skills||[], projects:r.projects||[], achievements:r.achievements||[], certifications:r.certifications||[], codingProfiles:r.coding_profiles||[], additional:r.additional||[], updatedAt:r.updated_at })) });
});

app.post('/api/resumes', async (req,res) => {
  const input = req.body || {};
  if (!input.title?.trim()) return fail(res, 'Resume name is required');
  const row = { title:input.title.trim(), template:input.template||'classic-one', profile:input.profile||{}, experience:input.experience||[], education:input.education||[], skills:input.skills||[], projects:input.projects||[], achievements:input.achievements||[], certifications:input.certifications||[], coding_profiles:input.codingProfiles||[], additional:input.additional||[] };
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) return fail(res, 'Could not save resume',500);
  res.status(201).json({ resume:{...row,id:data.id,updatedAt:data.updated_at,title:data.title} });
});

app.put('/api/resumes/:id', async (req,res) => {
  const input=req.body||{};
  if (!input.title?.trim()) return fail(res,'Resume name is required');
  const row={ title:input.title.trim(), template:input.template||'classic-one', profile:input.profile||{}, experience:input.experience||[], education:input.education||[], skills:input.skills||[], projects:input.projects||[], achievements:input.achievements||[], certifications:input.certifications||[], coding_profiles:input.codingProfiles||[], additional:input.additional||[], updated_at:new Date().toISOString() };
  const { data,error }=await supabase.from(table).update(row).eq('id',req.params.id).select().single();
  if(error || !data) return fail(res,'Resume not found',404);
  res.json({ resume:{...row,id:data.id,updatedAt:data.updated_at,title:data.title} });
});

app.delete('/api/resumes/:id', async (req,res) => {
  const { error }=await supabase.from(table).delete().eq('id',req.params.id);
  if(error) return fail(res,'Could not delete resume',500);
  res.json({ deleted:true });
});

app.post('/api/ai/bullets', async (req,res) => {
  const p=req.body||{}; if(!p.title?.trim()) return fail(res,'Title is required');
  try {
    const out=await aiJson(
      'Write exactly three concise resume bullets using only facts supplied by the user. Start each bullet with a strong action verb. Include implementation detail and a credible outcome. Never invent metrics, employers, users, revenue, dates or technologies. Each bullet must be a separate string and under 28 words.',
      `Type: ${p.kind||''}\nTitle: ${p.title}\nStack: ${p.stack||''}\nDescription: ${p.description||''}\nTarget role: ${p.role||''}\nKnown skills: ${(p.skills||[]).join(', ')}`,
      {type:'object',properties:{bullets:{type:'array',minItems:3,maxItems:3,items:{type:'string'}}},required:['bullets'],additionalProperties:false}
    );
    if(!Array.isArray(out.bullets)||out.bullets.length!==3) return fail(res,'AI did not return three bullets',502);
    res.json({ bullets:out.bullets });
  } catch(e) { console.error(e); fail(res,'AI bullet generation failed',502); }
});

app.post('/api/ai/quality-check', async (req,res) => {
  if(!req.body?.resume) return fail(res,'Resume is required');
  try {
    const out=await aiJson('Review a resume for placeholder text, vague wording, malformed links, suspiciously precise unsupported claims, duplicate content and date inconsistencies. Do not declare facts false without evidence. Return concise issues only.', resumeText(req.body.resume), {type:'object',properties:{issues:{type:'array',maxItems:8,items:{type:'object',properties:{field:{type:'string'},issue:{type:'string'},fix:{type:'string'},severity:{type:'string',enum:['high','medium','low']}},required:['field','issue','fix','severity'],additionalProperties:false}}},required:['issues'],additionalProperties:false});
    res.json(out);
  } catch(e) { console.error(e); fail(res,'AI quality check failed',502); }
});

app.post('/api/ai/import-resume', async (req,res) => {
  const p=req.body||{}; if(!p.text?.trim()) return fail(res,'Resume content is required');
  try {
    const out=await aiJson('Extract the resume into structured JSON. Preserve the user\'s facts and wording as much as practical. Never invent information. Split experience, education, skills, projects, achievements, certifications, coding profiles and additional information.', p.text.slice(0,30000), {
      type:'object',properties:{resume:{type:'object',properties:{title:{type:'string'},template:{type:'string'},profile:{type:'object'},experience:{type:'array'},education:{type:'array'},skills:{type:'array'},projects:{type:'array'},achievements:{type:'array'},certifications:{type:'array'},codingProfiles:{type:'array'},additional:{type:'array'}},required:['profile','experience','education','skills','projects','achievements','certifications','codingProfiles','additional'],additionalProperties:false}},required:['resume'],additionalProperties:false
    });
    res.json(out);
  } catch(e) { console.error(e); fail(res,'AI resume import failed',502); }
});

app.post('/api/ai/job-match', async (req,res) => {
  const p=req.body||{}; if(!p.resume || (!p.jobText?.trim()&&!p.jobUrl?.trim())) return fail(res,'Resume and job description or URL are required');
  try {
    let jd=p.jobText||'', jobTitle='';
    if(p.jobUrl?.trim()) {
      const url=cleanUrl(p.jobUrl.trim());
      if(!/^https?:\/\//i.test(url)) return fail(res,'Job URL must start with http:// or https://');
      const page=await fetch(url,{headers:{'user-agent':'Mozilla/5.0'}});
      if(!page.ok) return fail(res,'Could not read that job URL. Paste the job description instead.',502);
      const html=await page.text();
      jd=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,30000);
      jobTitle=url.split('/').filter(Boolean).pop()||'';
    }
    const out=await aiJson('Compare the resume with the job description. Do not rewrite or modify the resume. Identify job keywords genuinely supported by the resume, keywords present in the resume that are clearly irrelevant to this job, and important job terms that are missing. Return only concise keyword lists.','RESUME:\n'+resumeText(p.resume)+'\n\nJOB DESCRIPTION:\n'+jd, {type:'object',properties:{jobKeywords:{type:'array',items:{type:'string'}},matchedKeywords:{type:'array',items:{type:'string'}},missingKeywords:{type:'array',items:{type:'string'}},removeKeywords:{type:'array',items:{type:'string'}},jobTitle:{type:'string'}},required:['jobKeywords','matchedKeywords','missingKeywords','removeKeywords'],additionalProperties:false});
    const beforeScore=keywordScore(resumeText(p.resume),out.jobKeywords||[]);
    res.json({beforeScore,afterScore:beforeScore,matchedKeywords:out.matchedKeywords||[],missingKeywords:out.missingKeywords||[],changes:out.missingKeywords||[],jobTitle:out.jobTitle||jobTitle,resume:p.resume});
  } catch(e) { console.error(e); fail(res,'Job matching failed. Try pasting the job description.',502); }
});

export default app;
