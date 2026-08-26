import { createClient } from "npm:@supabase/supabase-js@2";
import { applicationApprovedEmail } from "./emails/applicationApproved.ts";
import { applicationDeclinedEmail } from "./emails/applicationDeclined.ts";
import { applicationReviewEmail } from "./emails/applicationReview.ts";
import { landlordApplicationSubmittedEmail } from "./emails/landlordApplicationSubmitted.ts";
import { moverApplicationSubmittedEmail } from "./emails/moverApplicationSubmitted.ts";
import { otpVerificationEmail } from "./emails/otpVerification.ts";
import { signInNotificationEmail } from "./emails/signInNotification.ts";
import { signUpWelcomeEmail } from "./emails/signUpWelcome.ts";
import { moverAdminNotificationEmail } from "./emails/moverAdminNotification.ts";
import { landlordAdminNotificationEmail } from "./emails/landlordAdminNotification.ts";

const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization, X-Client-Info, Apikey"};
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM");
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL");

type EmailType = "application_approved"|"application_declined"|"application_review"|"landlord_application_submitted"|"mover_application_submitted"|"landlord_admin_notification"|"mover_admin_notification"|"otp_verification"|"sign_in_notification"|"sign_up_welcome";

const EMAIL_TEMPLATES: Partial<Record<EmailType,(payload:any)=>string>> = {
  application_approved: applicationApprovedEmail,
  application_declined: applicationDeclinedEmail,
  application_review: applicationReviewEmail,
  landlord_application_submitted: landlordApplicationSubmittedEmail,
  mover_application_submitted: moverApplicationSubmittedEmail,
  landlord_admin_notification: landlordAdminNotificationEmail,
  mover_admin_notification: moverAdminNotificationEmail,
  sign_in_notification: signInNotificationEmail,
  sign_up_welcome: signUpWelcomeEmail,
};

const EMAIL_SUBJECTS: Record<EmailType,string> = {
  application_approved:"Your Saka Krib application has been approved",
  application_declined:"Update regarding your Saka Krib application",
  application_review:"Your Saka Krib application is under review",
  landlord_application_submitted:"Landlord application submitted - Saka Krib",
  landlord_admin_notification:"New landlord application requires review - Saka Krib",
  mover_application_submitted:"Mover application submitted - Saka Krib",
  mover_admin_notification:"New mover application requires review - Saka Krib",
  otp_verification:"Your Saka Krib verification code",
  sign_in_notification:"New sign-in to your Saka Krib account",
  sign_up_welcome:"Welcome to Saka Krib",
};

Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:200,headers:corsHeaders});
  if(req.method!=="POST") return json({success:false,error:"Method not allowed."},405);
  try {
    if(!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");
    if(!EMAIL_FROM) throw new Error("EMAIL_FROM is not configured.");
    const body=await req.json();
    const type=body?.type as EmailType;
    const application=body?.application&&typeof body.application==="object"?body.application:{};
    if(!type || !(type in EMAIL_SUBJECTS)) return json({success:false,error:`Unknown or missing email type: ${type||""}`},400);

    let recipient="";
    if(type==="landlord_admin_notification"||type==="mover_admin_notification") recipient=ADMIN_EMAIL?.trim()||"";
    else recipient=typeof application.email==="string"?application.email.trim().toLowerCase():typeof application.applicant_email==="string"?application.applicant_email.trim().toLowerCase():"";
    if(!recipient) throw new Error("No recipient email address was provided.");

    let htmlBody="";
    if(type==="otp_verification") {
      const {error:issueError}=await db.rpc("issue_signup_otp",{p_email:recipient});
      if(issueError) throw new Error(issueError.message||"Unable to issue the verification code.");

      const {data:otp,error:otpError}=await db.rpc("get_signup_otp_for_email",{p_email:recipient});
      if(otpError) throw new Error(otpError.message||"Unable to retrieve the verification code.");
      if(typeof otp!=="string" || !/^\d{6}$/.test(otp)) throw new Error("No valid active verification code was found.");

      const {data:profile,error:profileError}=await db.from("profiles").select("id,email,full_name,email_verified,signup_otp_expires_at").eq("email",recipient).eq("email_verified",false).maybeSingle();
      if(profileError) throw new Error("Unable to retrieve signup verification information.");
      if(!profile) throw new Error("No pending email verification was found.");
      if(!profile.signup_otp_expires_at || new Date(profile.signup_otp_expires_at).getTime()<=Date.now()) throw new Error("The verification code has expired.");

      htmlBody=otpVerificationEmail({
        full_name:profile.full_name||"",
        otp,
        purpose:typeof application.purpose==="string"&&application.purpose.trim()?application.purpose.trim():"verify your Saka Krib account"
      });
    } else {
      const template=EMAIL_TEMPLATES[type];
      if(!template) throw new Error(`No template registered for email type: ${type}`);
      htmlBody=template(application);
    }
    if(!htmlBody.trim()) throw new Error("Email template returned empty HTML.");

    const subject=EMAIL_SUBJECTS[type];
    const {data:notification,error:notificationError}=await db.from("notification_emails").insert({recipient,subject,html_body:htmlBody,template_type:type,status:"pending"}).select("id").single();
    if(notificationError) throw notificationError;

    const resendResponse=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:EMAIL_FROM,to:[recipient],subject,html:htmlBody})});
    let resendData:any={}; try{resendData=await resendResponse.json();}catch{}
    if(!resendResponse.ok){await db.from("notification_emails").update({status:"failed"}).eq("id",notification.id);throw new Error(resendData?.message||resendData?.error||`Resend failed with status ${resendResponse.status}.`);}
    await db.from("notification_emails").update({status:"sent",sent_at:new Date().toISOString()}).eq("id",notification.id);
    console.log("notification email sent",{type,recipient,notification_id:notification.id,resend_id:resendData?.id||null});
    return json({success:true,sent:true,notification_id:notification.id,resend_id:resendData?.id||null,recipient,type,subject},200);
  }catch(error){console.error("Notification email function error:",error);return json({success:false,error:error instanceof Error?error.message:"Unknown email error."},500);}
});
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}})}
