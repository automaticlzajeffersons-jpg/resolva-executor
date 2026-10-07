import express from "express";
import { chromium } from "playwright";

const app=express();
app.use(express.json({limit:"1mb"}));
const PORT=process.env.PORT||10000;
const risky=/contrat|assinar|fidel|pagamento|cart[aã]o|cancelar|confirmar pedido|finalizar compra|cpf|whatsapp|telefone|celular|e-?mail|senha|login|documento/i;
const support=/atendimento|fale conosco|suporte|chat|negoci|ajuda|contato/i;

app.get("/health",(_,res)=>res.json({ok:true,service:"resolva-executor",engine:"playwright"}));

app.post("/execute",async(req,res)=>{
 const {targetUrl,message,goal,policy}=req.body||{};
 if(!targetUrl||!/^https:\/\//i.test(targetUrl)||!message) return res.status(400).json({error:"targetUrl e message obrigatorios"});
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const ctx=await browser.newContext({locale:"pt-BR"});
  const page=await ctx.newPage();
  await page.goto(targetUrl,{waitUntil:"domcontentloaded",timeout:45000});
  await page.waitForTimeout(2500);
  const title=await page.title();
  let body=(await page.locator("body").innerText().catch(()=>"")).slice(0,25000);
  if(risky.test(body)&&/(cpf|whatsapp|telefone|senha|login)/i.test(body)){
   return res.json({status:"APPROVAL_REQUIRED",engine:"SELF_HOSTED",externalCost:false,summary:"O site solicita dado pessoal ou autenticação. Automação interrompida antes de fornecer qualquer dado.",title,url:page.url(),blocker:"PERSONAL_DATA_OR_AUTH"});
  }
  const candidates=page.getByRole("button").or(page.getByRole("link"));
  const count=Math.min(await candidates.count().catch(()=>0),80);
  for(let i=0;i<count;i++){
   const el=candidates.nth(i); const txt=(await el.innerText().catch(()=>"")).trim();
   if(txt&&support.test(txt)&&!risky.test(txt)){await el.click({timeout:2500}).catch(()=>{});await page.waitForTimeout(1800);break;}
  }
  const frames=page.frames();
  for(const frame of frames){
   const input=frame.locator('textarea, input[type="text"], [contenteditable="true"]').filter({visible:true}).first();
   if(await input.count().catch(()=>0)){
    const nearby=((await frame.locator("body").innerText().catch(()=>"")).slice(-10000));
    if(risky.test(nearby)&&/(cpf|whatsapp|telefone|senha|login)/i.test(nearby)) continue;
    await input.fill(message).catch(()=>{});
    const val=await input.inputValue().catch(()=>message);
    if(val){
     const send=frame.getByRole("button",{name:/enviar|send|continuar|avançar/i}).first();
     if(await send.count().catch(()=>0)){
      const label=await send.innerText().catch(()=>"");
      if(!risky.test(label)){await send.click({timeout:3000}).catch(()=>{});await page.waitForTimeout(1800);
       const after=(await frame.locator("body").innerText().catch(()=>"")).slice(-12000);
       const blocked=risky.test(after)&&/(cpf|whatsapp|telefone|senha|login|fidel|pagamento|contrat)/i.test(after);
       return res.json({status:blocked?"APPROVAL_REQUIRED":"COMPLETED",engine:"SELF_HOSTED",externalCost:false,summary:blocked?"Mensagem inicial enviada; o atendimento agora pede dado pessoal, autenticação ou compromisso. Parei aqui.":"Mensagem inicial não vinculante enviada pelo canal oficial.",title,url:page.url(),blocker:blocked?"PERSONAL_DATA_OR_COMMITMENT":null});
      }
     }
     return res.json({status:"APPROVAL_REQUIRED",engine:"SELF_HOSTED",externalCost:false,summary:"Encontrei o campo e preparei a mensagem, mas não identifiquei com segurança um botão de envio não vinculante.",title,url:page.url(),blocker:"SUBMIT_NOT_VERIFIED"});
    }
   }
  }
  return res.json({status:"APPROVAL_REQUIRED",engine:"SELF_HOSTED",externalCost:false,summary:"Navegação real concluída, mas nenhum campo de atendimento seguro foi identificado automaticamente.",title,url:page.url(),blocker:"NO_SAFE_INPUT"});
 }catch(e){return res.status(500).json({status:"FAILED",engine:"SELF_HOSTED",externalCost:false,error:String(e?.message||e)});}
 finally{if(browser)await browser.close().catch(()=>{});}
});
app.listen(PORT,"0.0.0.0",()=>console.log("resolva-executor listening",PORT));
