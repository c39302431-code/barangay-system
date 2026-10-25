const { dbCall } = require("./db");

async function main() {

    let rows = await dbCall("GET", "accounts", "?select=id,role,name,email,created_at&order=id.asc");

    if (rows.length === 0) {

        console.log("No accounts yet.");

        return;

    }

    console.table(rows);

}

main().catch(function(error) {

    console.log("Could not read accounts:", error.message);

});
