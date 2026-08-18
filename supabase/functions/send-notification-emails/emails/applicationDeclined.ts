// ============================================================
// APPLICATION DECLINED — USER EMAIL
// ============================================================

export function applicationDeclinedEmail(application: any) {
  const role =
    application.application_type === "landlord"
      ? "landlord"
      : "mover";

  /*
   * ----------------------------------------------------------
   * APPLICANT NAME
   * ----------------------------------------------------------
   *
   * Support the different payload structures used by
   * landlord and mover applications.
   */

  const fullName =
    application.full_name ||
    application.applicant_name ||
    application.driver_full_name ||
    "";

  const firstName = fullName.trim()
    ? fullName.trim().split(/\s+/)[0]
    : "there";

  /*
   * ----------------------------------------------------------
   * DECLINE REASON
   * ----------------------------------------------------------
   */

  const declineReason =
    application.decline_reason?.trim() || "";

  /*
   * ----------------------------------------------------------
   * APPLICATION ID
   * ----------------------------------------------------------
   */

  const applicationId =
    application.application_id ||
    application.id ||
    "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>Application Update</title>
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
          Better services. Better living.
        </p>

      </div>


      <!-- =====================================================
           STATUS
      ====================================================== -->

      <div style="
        padding:32px 25px;
        text-align:center;
        background:#fff3f3;
        border-top:1px solid #f3d2d2;
        border-bottom:1px solid #f3d2d2;
      ">

        <div style="
          width:58px;
          height:58px;
          margin:0 auto 15px;
          border-radius:50%;
          background:#fde8e8;
          line-height:58px;
          font-size:28px;
          font-weight:bold;
          color:#b42318;
        ">
          !
        </div>

        <h2 style="
          margin:0 0 10px;
          color:#b42318;
          font-size:24px;
        ">
          Application Update
        </h2>

        <p style="
          margin:0;
          color:#6b4a4a;
          font-size:14px;
          line-height:1.6;
        ">
          We have completed the review of your
          ${role} application.
        </p>

      </div>


      <!-- =====================================================
           BODY
      ====================================================== -->

      <div style="
        padding:30px;
      ">

        <p style="
          margin:0 0 16px;
          font-size:15px;
          line-height:1.7;
        ">
          Hello ${firstName},
        </p>

        <p style="
          margin:0 0 16px;
          color:#444444;
          font-size:15px;
          line-height:1.7;
        ">
          Thank you for your interest in becoming a
          <strong>${role}</strong> on Saka Krib.
        </p>

        <p style="
          margin:0 0 20px;
          color:#444444;
          font-size:15px;
          line-height:1.7;
        ">
          Unfortunately, after reviewing the information
          and documents provided, your application was
          not approved at this time.
        </p>


        <!-- =================================================
             APPLICATION DETAILS
        ================================================== -->

        <div style="
          margin:25px 0;
          padding:20px;
          background:#f5f7f6;
          border-radius:12px;
        ">

          <p style="
            margin:0 0 12px;
            font-size:13px;
            color:#777777;
            letter-spacing:0.5px;
          ">
            APPLICATION DETAILS
          </p>

          <table
            width="100%"
            cellpadding="0"
            cellspacing="0"
            style="border-collapse:collapse;"
          >

            <tr>

              <td style="
                padding:7px 0;
                color:#777777;
                font-size:14px;
              ">
                Application Type
              </td>

              <td style="
                padding:7px 0;
                text-align:right;
                font-weight:bold;
                font-size:14px;
              ">
                ${
                  role.charAt(0).toUpperCase() +
                  role.slice(1)
                }
              </td>

            </tr>


            <tr>

              <td style="
                padding:7px 0;
                color:#777777;
                font-size:14px;
              ">
                Status
              </td>

              <td style="
                padding:7px 0;
                text-align:right;
                font-weight:bold;
                color:#b42318;
                font-size:14px;
              ">
                Not Approved
              </td>

            </tr>

            ${
              applicationId
                ? `
            <tr>

              <td style="
                padding:7px 0;
                color:#777777;
                font-size:14px;
              ">
                Application ID
              </td>

              <td style="
                padding:7px 0;
                text-align:right;
                font-weight:bold;
                font-size:13px;
                word-break:break-all;
              ">
                ${applicationId}
              </td>

            </tr>
            `
                : ""
            }

          </table>

        </div>


        <!-- =================================================
             DECLINE REASON
        ================================================== -->

        ${
          declineReason
            ? `
        <div style="
          margin:25px 0;
          padding:20px;
          background:#fff8f8;
          border:1px solid #f1d1d1;
          border-left:4px solid #b42318;
          border-radius:8px;
        ">

          <p style="
            margin:0 0 8px;
            font-size:14px;
            font-weight:bold;
            color:#8f1d16;
          ">
            Reason for this decision
          </p>

          <p style="
            margin:0;
            color:#555555;
            font-size:14px;
            line-height:1.7;
          ">
            ${declineReason}
          </p>

        </div>
        `
            : ""
        }


        <!-- =================================================
             SUPPORT
        ================================================== -->

        <div style="
          margin:25px 0;
          padding:20px;
          border:1px solid #e5e7eb;
          border-radius:12px;
        ">

          <h3 style="
            margin:0 0 12px;
            font-size:16px;
            color:#222222;
          ">
            Need clarification?
          </h3>

          <p style="
            margin:0;
            color:#555555;
            font-size:14px;
            line-height:1.7;
          ">
            If you believe this decision was made in error
            or you need clarification regarding your
            application, please contact the Saka Krib
            support team.
          </p>

          <p style="
            margin:15px 0 0;
            font-size:14px;
          ">
            <a
              href="mailto:support@sakakrib.com"
              style="
                color:#255d3a;
                font-weight:bold;
                text-decoration:none;
              "
            >
              support@sakakrib.com
            </a>
          </p>

        </div>


        <p style="
          margin:25px 0 0;
          color:#555555;
          font-size:14px;
          line-height:1.7;
        ">
          Thank you for your interest in Saka Krib.
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