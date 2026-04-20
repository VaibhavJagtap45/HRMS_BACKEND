const fs = require("fs");
const path = require("path");

const info = path.basename("/files/info.txt");

fs.readFile("info.txt", "utf8", function (err, data) {
  if (err) {
    console.log("Error:", err.message);
    return;
  }
});
// fs.writeFileSync("info.txt", " this is the new text add here ");
fs.unlinkSync("info.txt");
console.log("File name:", info);

// Read file
// fs.readFile("info.txt", "utf8", function (err, data) {
//   if (err) {
//     console.log("Error:", err.message);
//     return;
//   }

//   console.log("File Content:", data);
// });
