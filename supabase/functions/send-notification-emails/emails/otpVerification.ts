// ============================================================
// OTP VERIFICATION EMAIL
// ============================================================

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function otpVerificationEmail(application: any) {
  const fullName =
    typeof application?.full_name === "string"
      ? application.full_name.trim()
      : "";

  const firstName = fullName
    ? fullName.split(/\s+/)[0]
    : "there";

  const otp =
    application?.otp ||
    application?.verification_code ||
    application?.code ||
    "";

  const purpose =
    application?.purpose ||
    "verify your account";

  const safeFirstName = escapeHtml(firstName);
  const safeOtp = escapeHtml(otp);
  const safePurpose = escapeHtml(purpose);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>Saka Krib Verification Code</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f6f7f9;
  color:#222222;
  font-family:Arial,Helvetica,sans-serif;
">

  <div style="
    width:100%;
    padding:30px 15px;
    background:#f6f7f9;
    box-sizing:border-box;
  ">

    <div style="
      width:100%;
      max-width:600px;
      margin:0 auto;
      background:#ffffff;
      border-radius:16px;
      overflow:hidden;
    ">

      <!-- ==================================================
           HEADER
      =================================================== -->

      <div style="
        padding:30px;
        text-align:center;
        background:#ffffff;
      ">

        <h1 style="
          margin:0;
          color:#255d3a;
          font-size:30px;
        ">
          Saka Krib
        </h1>

        <p style="
          margin:8px 0 0;
          color:#777777;
          font-size:14px;
        ">
          Moving made easier
        </p>

      </div>


      <!-- ==================================================
           STATUS
      =================================================== -->

      <div style="
        padding:32px 25px;
        text-align:center;
        background:#f1f7f3;
        border-top:1px solid #dfeae2;
        border-bottom:1px solid #dfeae2;
      ">

        <div style="
          width:58px;
          height:58px;
          margin:0 auto 15px;
          border-radius:50%;
          background:#255d3a;
          color:#ffffff;
          line-height:58px;
          font-size:27px;
          font-weight:bold;
        ">
          ✓
        </div>

        <h2 style="
          margin:0 0 10px;
          color:#255d3a;
          font-size:24px;
        ">
          Verification Code
        </h2>

        <p style="
          margin:0;
          color:#5f6f64;
          font-size:14px;
          line-height:1.6;
        ">
          Use the code below to ${safePurpose}.
        </p>

      </div>


      <!-- ==================================================
           BODY
      =================================================== -->

      <div style="
        padding:30px;
      ">

        <p style="
          margin:0 0 16px;
          font-size:15px;
          line-height:1.7;
          color:#333333;
        ">
          Hello ${safeFirstName},
        </p>

        <p style="
          margin:0 0 18px;
          font-size:14px;
          line-height:1.7;
          color:#555555;
        ">
          We received a request to ${safePurpose}.
          Enter the verification code below to continue.
        </p>


        <!-- ==================================================
             OTP CODE
        =================================================== -->

        <div style="
          margin:30px 0;
          padding:24px;
          text-align:center;
          background:#f5f7f6;
          border:1px solid #e1e7e3;
          border-radius:12px;
        ">

          <p style="
            margin:0 0 12px;
            color:#777777;
            font-size:12px;
            text-transform:uppercase;
            letter-spacing:1px;
          ">
            Verification Code
          </p>

          <div style="
            font-size:32px;
            line-height:1.3;
            font-weight:bold;
            letter-spacing:8px;
            color:#255d3a;
          ">
            ${safeOtp}
          </div>

        </div>


        <!-- ==================================================
             SECURITY NOTICE
        =================================================== -->

        <div style="
          padding:18px;
          background:#fff8e8;
          border:1px solid #f1e3bd;
          border-radius:10px;
          color:#765d20;
          font-size:13px;
          line-height:1.6;
        ">

          <strong>
            Keep your verification code private.
          </strong>

          <br><br>

          This code expires shortly. Never share it with
          anyone, including someone claiming to be from
          Saka Krib.

        </div>


        <p style="
          margin:25px 0 0;
          color:#777777;
          font-size:13px;
          line-height:1.6;
        ">
          If you did not request this verification code,
          you can safely ignore this email. Your account
          remains secure.
        </p>

      </div>


      <!-- ==================================================
           FOOTER
      =================================================== -->

      <div style="
        padding:25px;
        text-align:center;
        background:#1e1e1e;
        color:#aaaaaa;
        font-size:12px;
      ">

        <strong style="
          color:#ffffff;
          font-size:14px;
        ">
          Saka Krib
        </strong>

        <p style="
          margin:10px 0;
          line-height:1.6;
        ">
          Moving, renting and property services made easier.
        </p>

        <p style="
          margin:10px 0;
        ">
          <a
            href="mailto:support@sakakrib.com"
            style="
              color:#7fcf9a;
              text-decoration:none;
            "
          >
            support@sakakrib.com
          </a>
        </p>

        <hr style="
          border:none;
          border-top:1px solid #444444;
          margin:18px 0;
        ">

        <p style="
          margin:0;
          color:#888888;
        ">
          © ${new Date().getFullYear()}
          Saka Krib. All rights reserved.
        </p>

      </div>

    </div>

  </div>

</body>
</html>
`;
}