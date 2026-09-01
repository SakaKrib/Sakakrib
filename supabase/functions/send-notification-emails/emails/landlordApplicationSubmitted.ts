export function landlordApplicationSubmittedEmail(application) {
  /*
   * ------------------------------------------------------
   * APPLICATION TYPE
   * ------------------------------------------------------
   *
   * Support landlord and realestate applications.
   * Existing landlord applications remain unchanged.
   */ const applicationType = application.application_type === 'realestate' ? 'realestate' : 'landlord';
  const applicationName = applicationType === 'realestate' ? 'Real Estate' : 'Landlord';
  /*
   * ------------------------------------------------------
   * APPLICANT NAME
   * ------------------------------------------------------
   *
   * RegisterLandlordPage sends applicant_name.
   * full_name is kept as a fallback for older records.
   */ const applicantName = application.applicant_name?.trim() || application.full_name?.trim() || 'there';
  const firstName = applicantName !== 'there' ? applicantName.split(/\s+/)[0] : 'there';
  /*
   * ------------------------------------------------------
   * APPLICATION ID
   * ------------------------------------------------------
   */ const applicationId = application.application_id || application.id || 'Pending assignment';
  /*
   * ------------------------------------------------------
   * SUBMITTED DATE
   * ------------------------------------------------------
   */ const submittedAt = application.submitted_at ? new Date(application.submitted_at).toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }) : 'Just now';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>
    ${applicationName} Application Submitted
  </title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f6f7f9;
  font-family:Arial,Helvetica,sans-serif;
  color:#222222;
">

  <div style="
    width:100%;
    padding:30px 15px;
    box-sizing:border-box;
    background:#f6f7f9;
  ">

    <div style="
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
           SUCCESS STATUS
      ====================================================== -->

      <div style="
        padding:32px 25px;
        text-align:center;
        background:#e8f5e9;
        border-top:1px solid #c8e6c9;
        border-bottom:1px solid #c8e6c9;
      ">

        <div style="
          width:58px;
          height:58px;
          margin:0 auto 15px;
          border-radius:50%;
          background:#c8e6c9;
          line-height:58px;
          font-size:30px;
          font-weight:bold;
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
          Your ${applicationName.toLowerCase()} application has been
          successfully submitted.
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
          Thank you for applying to become a
          <strong>${applicationName.toLowerCase()}</strong> on Saka Krib.
          Your application has been received successfully
          and is now awaiting administrator review.
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
          ">
            APPLICATION DETAILS
          </p>

          <table
            width="100%"
            cellpadding="0"
            cellspacing="0"
            style="
              border-collapse:collapse;
            "
          >

            <tr>

              <td style="
                padding:7px 0;
                color:#777777;
                font-size:14px;
              ">
                Applicant
              </td>

              <td style="
                padding:7px 0;
                text-align:right;
                font-weight:bold;
                font-size:14px;
              ">
                ${applicantName}
              </td>

            </tr>


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
                ${applicationName}
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
                color:#9a6700;
                font-size:14px;
              ">
                Pending Review
              </td>

            </tr>


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


            <tr>

              <td style="
                padding:7px 0;
                color:#777777;
                font-size:14px;
              ">
                Submitted
              </td>

              <td style="
                padding:7px 0;
                text-align:right;
                font-size:13px;
              ">
                ${submittedAt}
              </td>

            </tr>

          </table>

        </div>


        <!-- =================================================
             WHAT HAPPENS NEXT
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
            What happens next?
          </h3>

          <p style="
            margin:0;
            color:#555555;
            font-size:14px;
            line-height:1.7;
          ">
            Our administration team will review the
            information and identity document you provided.
            Once the review is complete, you will receive
            another email informing you whether your
            ${applicationName.toLowerCase()} application has been approved or declined.
          </p>

        </div>


        <p style="
          margin:25px 0 0;
          color:#555555;
          font-size:14px;
          line-height:1.7;
        ">
          You do not need to submit another application
          while this application is under review.
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
