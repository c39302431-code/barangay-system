// Sends real emails through Resend (https://resend.com).
// It uses plain HTTPS, so it works on Render's free plan
// (free Render services block normal SMTP email ports).
//
// Needs these on Render > Environment:
//   RESEND_API_KEY   your Resend API key (starts with re_)
//   MAIL_FROM_EMAIL  the sender address. Use an address on a domain you
//                    verified in Resend. Until then, onboarding@resend.dev
//                    works, but only for emails to YOUR Resend account email.
//   MAIL_FROM_NAME   (optional) shown as the sender name

const { dbCall } = require("./db");


function mailIsSetUp() {

    return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM_EMAIL);

}


// Makes text safe to place inside the email's HTML
function safe(value) {

    return String(value === undefined || value === null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

}


// Wraps the message in a simple, clean layout
function wrap(title, lines) {

    let body = lines.map(function(line) {

        return '<p style="margin:0 0 12px;font-size:15px;color:#333;">' + line + "</p>";

    }).join("");

    return '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;' +
        'border:1px solid #e3e3e3;border-radius:8px;overflow:hidden;">' +
        '<div style="background:#087f5b;color:white;padding:16px 20px;font-size:17px;">' +
        "Barangay Document Processing</div>" +
        '<div style="padding:20px;">' +
        '<h2 style="margin:0 0 14px;font-size:18px;color:#111;">' + safe(title) + "</h2>" +
        body +
        '<p style="margin:18px 0 0;font-size:12px;color:#888;">' +
        "This is an automatic message. Please do not reply.</p>" +
        "</div></div>";

}


// Writes a row in email_log. If this fails, the email is not affected.
async function logMail(entry) {

    try {

        await dbCall("POST", "email_log", "", entry);

    } catch (error) {

        console.log("Could not write email_log: " + error.message);

    }

}


// Sends one email. It never throws, so a mail problem can never
// break sign-in, a request, or a status change.
// Returns true when the email was handed to Resend.
async function sendMail(options) {

    let entry = {
        account_id: options.accountId || null,
        request_id: options.requestId || null,
        to_email: options.to,
        kind: options.kind,
        subject: options.subject,
        status: "queued"
    };

    if (!mailIsSetUp()) {

        console.log("Email is not set up (missing RESEND_API_KEY or MAIL_FROM_EMAIL).");

        entry.status = "failed";
        entry.error = "Email is not set up";

        await logMail(entry);

        return false;

    }

    try {

        let fromName = process.env.MAIL_FROM_NAME || "Barangay Document System";

        let response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + process.env.RESEND_API_KEY,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: fromName + " <" + process.env.MAIL_FROM_EMAIL + ">",
                to: [options.to],
                subject: options.subject,
                html: options.html
            })
        });

        if (!response.ok) {

            let data = await response.json().catch(function() {

                return null;

            });

            throw new Error((data && data.message) || "Resend error " + response.status);

        }

        entry.status = "sent";
        entry.sent_at = new Date().toISOString();

        await logMail(entry);

        return true;

    } catch (error) {

        console.log("Email to " + options.to + " failed: " + error.message);

        entry.status = "failed";
        entry.error = String(error.message).slice(0, 300);

        await logMail(entry);

        return false;

    }

}


// ---------- The three emails the system sends ----------

function sendResetCode(account, code) {

    return sendMail({
        to: account.email,
        accountId: account.id,
        kind: "password_reset",
        subject: "Your password reset code",
        html: wrap("Reset your password", [
            "Hello " + safe(account.name) + ",",
            "Your reset code is:",
            '<span style="display:inline-block;font-size:30px;letter-spacing:6px;' +
                'font-weight:bold;color:#075c45;">' + safe(code) + "</span>",
            "This code expires in 15 minutes. If you did not ask for it, you can ignore this email."
        ])
    });

}


function sendRequestReceived(request, residentId) {

    return sendMail({
        to: request.resident.email,
        accountId: residentId,
        requestId: request.id,
        kind: "request_received",
        subject: "We received your request " + request.requestNo,
        html: wrap("Request received", [
            "Hello " + safe(request.resident.name) + ",",
            "We received your document request.",
            "<b>Request number:</b> " + safe(request.requestNo) + "<br>" +
                "<b>Document:</b> " + safe(request.documentType) + "<br>" +
                "<b>Release:</b> " + safe(request.releaseMethod) + "<br>" +
                "<b>Status:</b> " + safe(request.status),
            "We will email you when the status changes."
        ])
    });

}


function sendStatusUpdate(request, residentId) {

    return sendMail({
        to: request.resident.email,
        accountId: residentId,
        requestId: request.id,
        kind: "status_update",
        subject: "Request " + request.requestNo + ": " + request.status,
        html: wrap("Your request was updated", [
            "Hello " + safe(request.resident.name) + ",",
            "Your request <b>" + safe(request.requestNo) + "</b> (" +
                safe(request.documentType) + ") is now:",
            '<span style="font-size:20px;font-weight:bold;color:#075c45;">' +
                safe(request.status) + "</span>"
        ])
    });

}


module.exports = { sendResetCode, sendRequestReceived, sendStatusUpdate, mailIsSetUp };
