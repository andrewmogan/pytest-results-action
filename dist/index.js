/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 610:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const fs = (__nccwpck_require__(147).promises);

const core = __nccwpck_require__(927);
const glob = __nccwpck_require__(837);

const { XMLParser } = __nccwpck_require__(315);

module.exports = { parseXmlFiles };

async function* collectXmlFiles(path) {
  const globber = await glob.create(path, {
    implicitDescendants: false,
  });
  const paths = await globber.glob();

  for (const file_or_dir of paths) {
    var stats;
    try {
      stats = await fs.stat(file_or_dir);
    } catch (error) {
      core.setFailed(`Action failed with error ${error}`);
    }
    if (stats.isFile()) {
      yield file_or_dir;
    } else {
      const globber = await glob.create(file_or_dir + "/**/*.xml", {
        implicitDescendants: false,
      });
      for await (const file of globber.glob()) {
        yield file;
      }
    }
  }
}

async function* parseXmlFiles(path) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
  });

  for await (const file of collectXmlFiles(path)) {
    yield parser.parse(await fs.readFile(file, "utf-8"));
  }
}


/***/ }),

/***/ 892:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const fs = (__nccwpck_require__(147).promises);

const gha = __nccwpck_require__(927);

const { zip, prettyDuration } = __nccwpck_require__(492);

module.exports = { postResults };

// FIXME: refactor
const resultTypes = [
  "passed",
  "skipped",
  "xfailed",
  "failed",
  "xpassed",
  "error",
];
const resultTypesWithEmoji = zip(
  resultTypes,
  ["green", "yellow", "yellow", "red", "red", , "red"].map(
    (color) => `:${color}_circle:`
  )
);

async function postResults(xmls, inputs) {
  const results = await extractResults(xmls);
  if (results.total_tests == 0) {
    return;
  }

  addResults(results, inputs.title, inputs.summary, inputs.displayOptions);
  await gha.summary.write();
}

async function extractResults(xmls) {
  const results = {
    total_time: 0.0,
    total_tests: 0,
    // FIXME: incorporate from above
    passed: [],
    failed: [],
    skipped: [],
    xfailed: [],
    xpassed: [],
    error: [],
  };

  for await (const xml of xmls) {
    const testSuite = xml.testsuites.testsuite;
    results.total_time += parseFloat(testSuite["@_time"]);

    const testCases =
      testSuite.testcase instanceof Array
        ? testSuite.testcase
        : [testSuite.testcase];
    for (const result of testCases) {
      var resultTypeArray;
      var msg;

      if (Object.hasOwn(result, "failure")) {
        var msg = result.failure["#text"];
        const parts = msg.split("[XPASS(strict)] ");
        if (parts.length == 2) {
          resultTypeArray = results.xpassed;
          msg = parts[1];
        } else {
          resultTypeArray = results.failed;
        }
      } else if (Object.hasOwn(result, "skipped")) {
        switch (result.skipped["@_type"]) {
          case "pytest.skip":
            resultTypeArray = results.skipped;
            break;
          case "pytest.xfail":
            resultTypeArray = results.xfailed;
            break;
          default:
          // FIXME: throw an error here
        }
        msg = result.skipped["@_message"];
      } else if (Object.hasOwn(result, "error")) {
        resultTypeArray = results.error;
        // FIXME: do we need to integrate the message here?
        msg = result.error["#text"];
      } else {
        // This could also be an xpass when strict=False is set. Unfortunately, there is no way to differentiate here
        // See FIXME
        resultTypeArray = results.passed;
        msg = undefined;
      }

      resultTypeArray.push({
        id: result["@_classname"] + "." + result["@_name"],
        msg: msg,
      });
      results.total_tests += 1;
    }
  }

  return results;
}

async function addResults(results, title, summary, displayOptions) {
  gha.summary.addHeading(title);

  if (summary) {
    addSummary(results);
  }

  for (resultType of getResultTypesFromDisplayOptions(displayOptions)) {
    const results_for_type = results[resultType];
    if (!results_for_type.length) {
      continue;
    }

    gha.summary.addHeading(resultType, 2);

    for (const result of results_for_type) {
      // FIXME: check if message is undefined otherwise, just post this as regular line
      addDetailsWithCodeBlock(
        gha.summary,
        gha.summary.wrap("code", result.id),
        result.msg
      );
    }
  }
}

function addSummary(results) {
  gha.summary.addRaw(
    `Ran ${results.total_tests} tests in ${prettyDuration(results.total_time)}. Huzzah!`,
    true
  );

  var rows = [["Result", "Amount", "Test IDs"]];
  for (const [resultType, emoji] of resultTypesWithEmoji) {
    const resultArray = results[resultType];
    const abs_amount = resultArray.length;
    const rel_amount = abs_amount / results.total_tests;
    const testIds = resultArray.map(testResult => testResult.id).join(', ');
    rows.push([
      `${emoji} ${resultType}`,
      `${abs_amount} (${(rel_amount * 100).toFixed(1)}%)`,
      testIds, 
    ]);
  }

  gha.summary.addTable(rows);
}

function getResultTypesFromDisplayOptions(displayOptions) {
  // 'N' resets the list of chars passed to the '-r' option of pytest. Thus, we only
  // care about anything after the last occurrence
  const displayChars = displayOptions.split("N").pop();

  console.log(displayChars);

  if (displayChars.toLowerCase().includes("a")) {
    return resultTypes;
  }

  var displayTypes = new Set();
  for (const [displayChar, displayType] of [
    ["f", "failed"],
    ["E", "error"],
    ["s", "skipped"],
    ["x", "xfailed"],
    ["X", "xpassed"],
    ["p", "passed"],
    ["P", "passed"],
  ]) {
    if (displayOptions.includes(displayChar)) {
      displayTypes.add(displayType);
    }
  }

  return [...displayTypes];
}

function addDetailsWithCodeBlock(summary, label, code) {
  return summary.addDetails(
    label,
    "\n\n" + summary.wrap("pre", summary.wrap("code", code))
  );
}


/***/ }),

/***/ 492:
/***/ ((module) => {

module.exports = { checkAsyncGeneratorEmpty, prettyDuration, zip };

async function* prefixAsyncGenerator(prefix, gen) {
  yield prefix;
  for await (const item of gen) {
    yield item;
  }
}

async function checkAsyncGeneratorEmpty(gen) {
  const { done, value } = await gen.next();
  var isEmpty;
  var out_gen;
  if (done) {
    isEmpty = true;
    out_gen = gen;
  } else {
    isEmpty = false;
    out_gen = prefixAsyncGenerator(value, gen);
  }

  return { isEmpty: isEmpty, generator: out_gen };
}

function prettyDuration(seconds) {
  var seconds = Math.ceil(seconds);

  var minutes = Math.floor(seconds / 60);
  if (minutes == 0) {
    return `${seconds}s`;
  }
  seconds = seconds % 60;

  const hours = Math.floor(minutes / 60);
  if (hours == 0) {
    return `${minutes}m ${seconds}s`;
  }
  minutes = minutes % 60;

  return `${hours}h ${minutes}m ${seconds}s`;
}

function zip(a, b) {
  return a.map((obj, idx) => [obj, b[idx]]);
}


/***/ }),

/***/ 927:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 837:
/***/ ((module) => {

module.exports = eval("require")("@actions/glob");


/***/ }),

/***/ 315:
/***/ ((module) => {

module.exports = eval("require")("fast-xml-parser");


/***/ }),

/***/ 147:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
const gha = __nccwpck_require__(927);
const { checkAsyncGeneratorEmpty } = __nccwpck_require__(492);
const { parseXmlFiles } = __nccwpck_require__(610);
const { postResults } = __nccwpck_require__(892);

async function main() {
  const inputs = getInputs();

  var xmls = parseXmlFiles(inputs.path);

  const { isEmpty, generator } = await checkAsyncGeneratorEmpty(xmls);
  if (isEmpty && inputs.failOnEmpty) {
    gha.setFailed(
      "No JUnit XML file was found. Set `fail-on-empty: false` if that is a valid use case"
    );
  }
  xmls = generator;

  await postResults(xmls, inputs);
}

function getInputs() {
  return {
    path: gha.getInput("path", { required: true }),
    summary: gha.getBooleanInput("summary", {
      required: false,
    }),
    displayOptions: gha.getInput("display-options", { required: false }),
    failOnEmpty: gha.getBooleanInput("fail-on-empty", {
      required: false,
    }),
    title: gha.getInput("title", { required: false }),
  };
}

main();

})();

module.exports = __webpack_exports__;
/******/ })()
;