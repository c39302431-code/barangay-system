const fs = require("fs");

// Reads the .env file when there is one (on Render the settings are already set)
if (fs.existsSync(__dirname + "/.env")) {

    let raw = fs.readFileSync(__dirname + "/.env");

    // Files saved by some Windows tools are UTF-16; normal files are UTF-8
    let content = (raw[0] === 0xFF && raw[1] === 0xFE) ? raw.toString("utf16le") : raw.toString("utf8");

    // Remove an invisible mark some editors put at the very start
    content = content.replace(/^\uFEFF/, "");

    // Handles Windows (\r\n) and other line endings
    for (let line of content.split(/\r?\n/)) {

        let at = line.indexOf("=");

        if (at > 0 && !line.trim().startsWith("#")) {

            let name = line.slice(0, at).trim().replace(/^export\s+/, "");

            // Quotes around a value are removed, so NAME="abc" works too
            let value = line.slice(at + 1).trim().replace(/^(["'])(.*)\1$/, "$2");

            process.env[name] = value;

        }

    }

}


// Talks to the Supabase database. It returns the matching rows.
async function dbCall(method, table, query, body) {

    let key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let headers = {
        apikey: key,
        "Content-Type": "application/json",
        Prefer: "return=representation"
    };

    // The old service_role key is a long token starting with "eyJ" and also
    // goes in Authorization. The newer sb_secret_... key must only be sent
    // as apikey.
    if (key.startsWith("eyJ")) {

        headers.Authorization = "Bearer " + key;

    }

    let response = await fetch(process.env.SUPABASE_URL + "/rest/v1/" + table + query, {
        method: method,
        headers: headers,
        body: body ? JSON.stringify(body) : undefined
    });

    let data = await response.json().catch(function() {

        return null;

    });

    if (!response.ok) {

        throw new Error((data && data.message) || "Database error");

    }

    return data;

}


// Builds a filter like  email=eq.someone@example.com
function eq(column, value) {

    return column + "=eq." + encodeURIComponent(value);

}


module.exports = { dbCall, eq };