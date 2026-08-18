// ============================================================
// MOVER APPLICATION — ADMIN NOTIFICATION EMAIL
// ============================================================

export function moverAdminNotificationEmail(application: any) {
  /*
   * ------------------------------------------------------
   * APPLICANT
   * ------------------------------------------------------
   */

  const applicantName =
    application.applicant_name?.trim() ||
    application.driver_full_name?.trim() ||
    application.full_name?.trim() ||
    'Unknown applicant';

  const applicantEmail =
    application.applicant_email?.trim() ||
    application.email?.trim() ||
    'Not provided';

  const phone =
    application.phone?.trim() ||
    'Not provided';

  /*
   * ------------------------------------------------------
   * VEHICLE
   * ------------------------------------------------------
   */

  const vehicleType =
    application.vehicle_type ||
    'Not provided';

  const vehicleNumber =
    application.number_plate ||
    application.vehicle_number ||
    'Not provided';

  /*
   * ------------------------------------------------------
   * OPERATING LOCATION
   * ------------------------------------------------------
   */

  const operatingCity =
    application.operating_city ||
    'Not provided';

  const operatingCounty =
    application.operating_county ||
    'Not provided';

  /*
   * ------------------------------------------------------
   * APPLICATION
   * ------------------------------------------------------
   */

  const applicationId =
    application.application_id ||
    application.id ||
    'Pending assignment';

  const submittedAt =
    application.submitted_at
      ? new Date(
          application.submitted_at
        ).toLocaleString('en-KE', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : 'Just now';

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
    New Mover Application
  </title>
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
    box-sizing:border-box;
    background:#f6f7f9;
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
          font-size:28px;
          color:#255d3a;
        ">
          Saka Krib
        </h1>

        <p style="
          margin:8px 0 0;
          color:#777777;
          font-size:14px;
        ">
          Administration Notification
        </p>

      </div>


      <!-- ==================================================
           ALERT
      =================================================== -->

      <div style="
        padding:28px 25px;
        text-align:center;
        background:#fff8e1;
        border-top:1px solid #f3e5ab;
        border-bottom:1px solid #f3e5ab;
      ">

        <div style="
          font-size:38px;
          line-height:1;
        ">
          🚚
        </div>

        <h2 style="
          margin:12px 0 8px;
          color:#7a5600;
          font-size:23px;
        ">
          New Mover Application
        </h2>

        <p style="
          margin:0;
          color:#806c3c;
          font-size:14px;
          line-height:1.6;
        ">
          A new mover application has been submitted
          and requires administrator review.
        </p>

      </div>


      <!-- ==================================================
           APPLICATION SUMMARY
      =================================================== -->

      <div style="
        padding:30px 25px;
      ">

        <h3 style="
          margin:0 0 18px;
          font-size:18px;
          color:#222222;
        ">
          Application Summary
        </h3>


        <div style="
          border:1px solid #e5e7eb;
          border-radius:12px;
          overflow:hidden;
        ">

          <table
            width="100%"
            cellpadding="0"
            cellspacing="0"
            style="
              border-collapse:collapse;
            "
          >

            <!-- APPLICANT -->

            <tr>

              <td style="
                padding:13px;
                color:#777777;
                font-size:13px;
                border-bottom:1px solid #eeeeee;
              ">
                Applicant
              </td>

              <td style="
                padding:13px;
                text-align:right;
                font-weight:bold;
                font-size:13px;
                border-bottom:1px solid #eeeeee;
              ">
                ${applicantName}
              </td>

            </tr>


            <!-- EMAIL -->

            <tr>

              <td style="
                padding:13px;
                color:#777777;
                font-size:13px;
                border-bottom:1px solid #eeeeee;
              ">
                Email
              </td>

              <td style="
                padding:13px;
                text-align:right;
                font-size:13px;
                border-bottom:1px solid #eeeeee;
                word-break:break-word;
              ">
                ${applicantEmail}
              </td>

            </tr>


            <!-- PHONE -->

            <tr>

              <td style="
                padding:13px;
                color:#777777;
                font-size:13px;
                border-bottom:1px solid #eeeeee;
              ">
                Phone
              </td>

              <td style="
                padding:13px;
                text-align:right;
                font-size:13px;
                border-bottom:1px solid #eeeeee;
              ">
                ${phone}
              </td>

            </tr>


            <!-- VEHICLE TYPE -->

            <tr>

              <td style="
                padding:13px;
                color:#777777;
                font-size:13px;
                border-bottom:1px solid #eeeeee;
              ">
                Vehicle Type
              </td>

              <td style="
                padding:13px;
                text-align:right;
                font-size:13px;
                border-bottom:1px solid #eeeeee;
              ">
                ${vehicleType}
              </td>

            </tr>


            <!-- NUMBER PLATE -->

            <tr>

              <td style="
                padding:13px;
                color:#777777;
                font-size:13px;
                border-bottom:1px solid #eeeeee;
              ">
                Number Plate
              </td>

              <td style="
                padding:13px;
                text-align:right;
                font-weight:bold;
                font-size:13px;
                border-bottom:1px solid #eeeeee;
              ">
                ${vehicleNumber}
              </td>

            </tr>


            <!-- OPERATING CITY -->

            <tr>

              <td style="
                padding:13px;
                color:#777777;
                font-size:13px;
                border-bottom:1px solid #eeeeee;
              ">
                Operating City
              </td>

              <td style="
                padding:13px;
                text-align:right;
                font-size:13px;
                border-bottom:1px solid #eeeeee;
              ">
                ${operatingCity}
              </td>

            </tr>


            <!-- COUNTY -->

            <tr>

              <td style="
                padding:13px;
                color:#777777;
                font-size:13px;
              ">
                County
              </td>

              <td style="
                padding:13px;
                text-align:right;
                font-size:13px;
              ">
                ${operatingCounty}
              </td>

            </tr>

          </table>

        </div>


        <!-- ==================================================
             APPLICATION STATUS
        =================================================== -->

        <div style="
          margin-top:22px;
          padding:18px;
          background:#f5f7f6;
          border-radius:10px;
        ">

          <div style="
            font-size:12px;
            color:#777777;
          ">
            Application Status
          </div>

          <div style="
            margin-top:5px;
            font-size:16px;
            font-weight:bold;
            color:#b26a00;
          ">
            Pending Review
          </div>

        </div>


        <!-- ==================================================
             SUBMISSION INFORMATION
        =================================================== -->

        <div style="
          margin-top:18px;
          font-size:12px;
          color:#777777;
          line-height:1.7;
        ">

          <strong>
            Application ID:
          </strong>

          ${applicationId}

          <br>

          <strong>
            Submitted:
          </strong>

          ${submittedAt}

        </div>


        <!-- ==================================================
             ACTION
        =================================================== -->

        <div style="
          text-align:center;
          margin:30px 0 10px;
        ">

          <a
            href="https://sakakrib.com/admin"
            style="
              display:inline-block;
              padding:14px 28px;
              background:#255d3a;
              color:#ffffff;
              border-radius:8px;
              font-size:14px;
              font-weight:bold;
              text-decoration:none;
            "
          >
            Review Application
          </a>

        </div>


        <!-- ==================================================
             ADMIN NOTE
        =================================================== -->

        <div style="
          margin-top:25px;
          padding:18px;
          background:#f8faf9;
          border-left:4px solid #255d3a;
          border-radius:6px;
          color:#526158;
          font-size:13px;
          line-height:1.6;
        ">

          <strong>
            Administrator action required
          </strong>

          <br><br>

          Please review the applicant's identity,
          driving licence, vehicle information,
          insurance details, inspection status and
          references before approving or declining
          the application.

        </div>

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
        ">
          Administration Notification
        </p>

        <p style="
          margin:0;
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