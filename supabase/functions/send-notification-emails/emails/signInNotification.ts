// ============================================================
// SIGN-IN NOTIFICATION EMAIL
// ============================================================
function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function escapeUrl(value) {
  const url = String(value ?? "").trim();
  // Only allow HTTP(S) URLs.
  if (!/^https?:\/\//i.test(url)) {
    return "https://sakakrib.com";
  }
  return escapeHtml(url);
}
export function signInNotificationEmail(user) {
  const fullName = typeof user?.full_name === "string" ? user.full_name.trim() : "";
  const firstName = fullName ? fullName.split(/\s+/)[0] : "there";
  const email = typeof user?.email === "string" ? user.email.trim() : "";
  const signInTime = typeof user?.sign_in_time === "string" ? user.sign_in_time : "";
  const device = typeof user?.device === "string" ? user.device : "";
  const location = typeof user?.location === "string" ? user.location : "";
  const securityUrl = escapeUrl(user?.security_url || "https://sakakrib.com");
  const safeFirstName = escapeHtml(firstName);
  const safeEmail = escapeHtml(email);
  const safeSignInTime = escapeHtml(signInTime);
  const safeDevice = escapeHtml(device);
  const safeLocation = escapeHtml(location);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>New Sign In to Your Saka Krib Account</title>
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

    <!-- =====================================================
         HEADER
    ====================================================== -->

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
        Account Security Notification
      </p>

    </div>


    <!-- =====================================================
         STATUS
    ====================================================== -->

    <div style="
      padding:30px 25px;
      text-align:center;
      background:#eef6ff;
    ">

      <div style="
        width:60px;
        height:60px;
        margin:0 auto 15px;
        border-radius:50%;
        background:#dbeafe;
        line-height:60px;
        font-size:28px;
      ">
        🔐
      </div>

      <h2 style="
        margin:0 0 10px;
        color:#1e4f7a;
        font-size:24px;
      ">
        Successful Sign In
      </h2>

      <p style="
        margin:0;
        color:#4b6073;
        font-size:14px;
        line-height:1.6;
      ">
        Your Saka Krib account was successfully accessed.
      </p>

    </div>


    <!-- =====================================================
         BODY
    ====================================================== -->

    <div style="padding:30px;">

      <p style="
        margin:0 0 16px;
        font-size:15px;
        line-height:1.7;
      ">
        Hello ${safeFirstName},
      </p>

      <p style="
        margin:0 0 20px;
        color:#444444;
        font-size:15px;
        line-height:1.7;
      ">
        We detected a successful sign in to your
        Saka Krib account.
      </p>


      <!-- =================================================
           LOGIN DETAILS
      ================================================== -->

      <div style="
        margin:25px 0;
        padding:20px;
        background:#f5f7f6;
        border-radius:12px;
      ">

        <p style="
          margin:0 0 12px;
          color:#777777;
          font-size:13px;
        ">
          SIGN-IN DETAILS
        </p>

        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          style="border-collapse:collapse;"
        >

          ${safeEmail ? `
          <tr>
            <td style="
              padding:7px 0;
              color:#777777;
              font-size:14px;
            ">
              Account
            </td>

            <td style="
              padding:7px 0;
              text-align:right;
              font-size:14px;
              word-break:break-word;
            ">
              ${safeEmail}
            </td>
          </tr>
          ` : ""}


          ${safeSignInTime ? `
          <tr>
            <td style="
              padding:7px 0;
              color:#777777;
              font-size:14px;
            ">
              Date &amp; Time
            </td>

            <td style="
              padding:7px 0;
              text-align:right;
              font-size:14px;
            ">
              ${safeSignInTime}
            </td>
          </tr>
          ` : ""}


          ${safeDevice ? `
          <tr>
            <td style="
              padding:7px 0;
              color:#777777;
              font-size:14px;
            ">
              Device
            </td>

            <td style="
              padding:7px 0;
              text-align:right;
              font-size:14px;
            ">
              ${safeDevice}
            </td>
          </tr>
          ` : ""}


          ${safeLocation ? `
          <tr>
            <td style="
              padding:7px 0;
              color:#777777;
              font-size:14px;
            ">
              Location
            </td>

            <td style="
              padding:7px 0;
              text-align:right;
              font-size:14px;
            ">
              ${safeLocation}
            </td>
          </tr>
          ` : ""}

        </table>

      </div>


      <!-- =================================================
           SECURITY NOTICE
      ================================================== -->

      <div style="
        margin:25px 0;
        padding:18px;
        background:#fff8e6;
        border:1px solid #f1e3bd;
        border-radius:10px;
        color:#735f35;
        font-size:13px;
        line-height:1.6;
      ">

        <strong>Wasn't you?</strong>

        <br><br>

        If you did not sign in to your account, please
        review your account security and contact Saka Krib
        support if you notice anything suspicious.

      </div>


      <!-- =================================================
           SECURITY ACTION
      ================================================== -->

      <div style="
        text-align:center;
        margin:30px 0;
      ">

        <a
          href="${securityUrl}"
          style="
            display:inline-block;
            padding:14px 30px;
            background:#255d3a;
            color:#ffffff;
            text-decoration:none;
            border-radius:8px;
            font-size:14px;
            font-weight:bold;
          "
        >
          Review Account Security
        </a>

      </div>


      <p style="
        margin:0;
        color:#777777;
        font-size:13px;
        line-height:1.6;
      ">
        If you recognize this sign-in, no action is required.
        This notification was sent to help keep your Saka Krib
        account secure.
      </p>

    </div>


    <!-- =====================================================
         FOOTER
    ====================================================== -->

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
        Keeping your account safe and secure.
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
