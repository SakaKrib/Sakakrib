// ============================================================
// SIGN-UP WELCOME EMAIL
// ============================================================
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function escapeUrl(value) {
  return escapeHtml(value);
}
export function signUpWelcomeEmail(user) {
  const fullName = typeof user?.full_name === "string" ? user.full_name.trim() : "";
  const firstName = fullName ? fullName.split(/\s+/)[0] : "there";
  const email = typeof user?.email === "string" ? user.email.trim() : "";
  const dashboardUrl = typeof user?.dashboard_url === "string" && user.dashboard_url.trim() ? user.dashboard_url.trim() : "https://sakakrib.com";
  const safeFirstName = escapeHtml(firstName);
  const safeFullName = escapeHtml(fullName);
  const safeEmail = escapeHtml(email);
  const safeDashboardUrl = escapeUrl(dashboardUrl);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>Welcome to Saka Krib</title>
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
          Moving, renting and property services made easier.
        </p>

      </div>


      <!-- =====================================================
           WELCOME STATUS
      ====================================================== -->

      <div style="
        padding:32px 25px;
        text-align:center;
        background:#e8f5e9;
        border-top:1px solid #d7ead9;
        border-bottom:1px solid #d7ead9;
      ">

        <div style="
          width:58px;
          height:58px;
          margin:0 auto 15px;
          border-radius:50%;
          background:#255d3a;
          color:#ffffff;
          line-height:58px;
          font-size:28px;
          font-weight:bold;
        ">
          ✓
        </div>

        <h2 style="
          margin:0 0 10px;
          color:#1b5e20;
          font-size:24px;
        ">
          Welcome to Saka Krib
        </h2>

        <p style="
          margin:0;
          color:#4b6350;
          font-size:14px;
          line-height:1.6;
        ">
          Your account has been successfully created.
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
          color:#333333;
        ">
          Hello ${safeFirstName},
        </p>

        <p style="
          margin:0 0 18px;
          color:#444444;
          font-size:15px;
          line-height:1.7;
        ">
          Welcome to Saka Krib. Your account has been
          successfully created and you can now start
          using the platform.
        </p>


        <!-- =================================================
             ACCOUNT DETAILS
        ================================================== -->

        ${fullName || email ? `
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
            ACCOUNT DETAILS
          </p>

          <table
            width="100%"
            cellpadding="0"
            cellspacing="0"
            style="border-collapse:collapse;"
          >

            ${fullName ? `
            <tr>

              <td style="
                padding:7px 0;
                color:#777777;
                font-size:14px;
              ">
                Name
              </td>

              <td style="
                padding:7px 0;
                text-align:right;
                font-size:14px;
                font-weight:bold;
                word-break:break-word;
              ">
                ${safeFullName}
              </td>

            </tr>
            ` : ""}

            ${email ? `
            <tr>

              <td style="
                padding:7px 0;
                color:#777777;
                font-size:14px;
              ">
                Email
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

          </table>

        </div>
        ` : ""}


        <!-- =================================================
             NEXT STEP
        ================================================== -->

        <div style="
          margin:25px 0;
          padding:20px;
          border:1px solid #e5e7eb;
          border-radius:12px;
        ">

          <h3 style="
            margin:0 0 12px;
            color:#222222;
            font-size:16px;
          ">
            You're ready to get started
          </h3>

          <p style="
            margin:0;
            color:#555555;
            font-size:14px;
            line-height:1.7;
          ">
            Sign in to your Saka Krib account to manage
            your profile and access the services available
            to you.
          </p>

        </div>


        <!-- =================================================
             ACTION
        ================================================== -->

        <div style="
          text-align:center;
          margin:30px 0;
        ">

          <a
            href="${safeDashboardUrl}"
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
            Open Saka Krib
          </a>

        </div>


        <p style="
          margin:0;
          color:#777777;
          font-size:13px;
          line-height:1.6;
        ">
          If you did not create this account, please contact
          Saka Krib support immediately.
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
          Moving, renting and property services made easier.
        </p>

        <p style="margin:10px 0;">

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
