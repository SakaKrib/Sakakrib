// ============================================================
// MOVER APPLICATION — SUBMISSION CONFIRMATION EMAIL
// ============================================================
export function moverApplicationSubmittedEmail(application) {
  const firstName = application.full_name?.trim() ? application.full_name.trim().split(/\s+/)[0] : "there";
  const vehicleType = application.vehicle_type || "Not provided";
  const operatingCity = application.operating_city || "Not provided";
  const operatingCounty = application.operating_county || "Not provided";
  const applicationId = application.application_id || application.id || null;
  const submittedAt = application.submitted_at ? new Date(application.submitted_at).toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short"
  }) : "Just now";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>Mover Application Submitted</title>
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
        background:#e8f5e9;
        border-top:1px solid #d8ead9;
        border-bottom:1px solid #d8ead9;
      ">

        <div style="
          width:58px;
          height:58px;
          margin:0 auto 15px;
          border-radius:50%;
          background:#d5ecd8;
          line-height:58px;
          font-size:28px;
          color:#1b5e20;
        ">
          ✓
        </div>

        <h2 style="
          margin:0 0 10px;
          color:#1b5e20;
          font-size:24px;
        ">
          Application Submitted
        </h2>

        <p style="
          margin:0;
          color:#4b6350;
          font-size:14px;
          line-height:1.6;
        ">
          Your mover application has been successfully submitted
          and is now awaiting review.
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
        ">
          Hello ${firstName},
        </p>

        <p style="
          margin:0 0 18px;
          color:#444444;
          font-size:15px;
          line-height:1.7;
        ">
          Thank you for applying to become a
          <strong>mover</strong> on Saka Krib.
          We have successfully received your application.
        </p>


        <!-- ==================================================
             APPLICATION DETAILS
        =================================================== -->

        <div style="
          margin:25px 0;
          padding:20px;
          background:#f5f7f6;
          border-radius:12px;
        ">

          <p style="
            margin:0 0 14px;
            font-size:13px;
            color:#777777;
            font-weight:bold;
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
                padding:8px 0;
                color:#777777;
                font-size:14px;
              ">
                Application
              </td>

              <td style="
                padding:8px 0;
                text-align:right;
                font-weight:bold;
                font-size:14px;
              ">
                Mover Registration
              </td>

            </tr>


            <tr>

              <td style="
                padding:8px 0;
                color:#777777;
                font-size:14px;
              ">
                Status
              </td>

              <td style="
                padding:8px 0;
                text-align:right;
                font-weight:bold;
                color:#9a6700;
                font-size:14px;
              ">
                Pending Review
              </td>

            </tr>


            <tr>

              <td style="
                padding:8px 0;
                color:#777777;
                font-size:14px;
              ">
                Vehicle Type
              </td>

              <td style="
                padding:8px 0;
                text-align:right;
                font-size:14px;
              ">
                ${vehicleType}
              </td>

            </tr>


            <tr>

              <td style="
                padding:8px 0;
                color:#777777;
                font-size:14px;
              ">
                Operating City
              </td>

              <td style="
                padding:8px 0;
                text-align:right;
                font-size:14px;
              ">
                ${operatingCity}
              </td>

            </tr>


            <tr>

              <td style="
                padding:8px 0;
                color:#777777;
                font-size:14px;
              ">
                County
              </td>

              <td style="
                padding:8px 0;
                text-align:right;
                font-size:14px;
              ">
                ${operatingCounty}
              </td>

            </tr>

          </table>

        </div>


        ${applicationId ? `
        <div style="
          margin:20px 0;
          padding:16px;
          background:#f8faf9;
          border-radius:10px;
          font-size:13px;
          color:#666666;
        ">

          <strong style="color:#333333;">
            Application ID:
          </strong>

          <span style="word-break:break-all;">
            ${applicationId}
          </span>

          <br>

          <strong style="color:#333333;">
            Submitted:
          </strong>

          ${submittedAt}

        </div>
        ` : ""}


        <!-- ==================================================
             WHAT HAPPENS NEXT
        =================================================== -->

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
            What happens next?
          </h3>

          <p style="
            margin:0;
            color:#555555;
            font-size:14px;
            line-height:1.7;
          ">
            Our team will review the information and documents
            you provided. Once the review is complete, you will
            receive another email informing you whether your
            application has been approved or declined.
          </p>

        </div>


        <p style="
          margin:20px 0 0;
          color:#555555;
          font-size:14px;
          line-height:1.7;
        ">
          You do not need to submit another application while
          this application is being reviewed.
        </p>


        <p style="
          margin:20px 0 0;
          color:#555555;
          font-size:14px;
          line-height:1.7;
        ">
          Thank you for choosing Saka Krib.
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
