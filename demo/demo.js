DJM._Settings({ appendResponses: true });
let resetRequested = false;

const selectJsonKey = document.querySelector("#select-json-key");
const selectResponse = document.querySelector("#select-response");
const appendNodeCheckbox = document.querySelector("#append-node");
const alertCheckbox = document.querySelector("#alert");
const reloadButton = document.querySelector("#reload");
const runButton = document.querySelector("#run");
// const responseButton = document.querySelector("#response");
const resetButton = document.querySelector("#reset");
const textArea = document.querySelector("#textArea");

function run(response) {
  const date = new Date();
  const selectedKey = selectJsonKey.options[selectJsonKey.selectedIndex].text;
  const replaceTemplate = {
    onProp: "message",
    replace: [
      { here: "[name]", to: "FOO" },
      { here: "{month}", to: date.getMonth() + 1 },
      { here: "{day}", to: date.getDate() },
      { here: "{year}", to: date.getFullYear() },
      { here: "{time}", to: date.toLocaleString("en-US", { hour: "numeric", minute: "numeric", hour12: true }) }
    ]
  };
  /* Same but better performance replace template sample: */
  // const time = date.toLocaleString("en-US", { hour: "numeric", minute: "numeric", hour12: true });
  // const replaceTemplate = {
  //   onProp: "message",
  //   replace: [
  //     { here: "[name]", to: "FOO" },
  //     {
  //       here: "{month}/{day}/{year} - {time}",
  //       to: `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} - ${time}`
  //     },
  //     { here: "{time}", to: time }
  //   ]
  // };
  const excludeTemplate = {
    onProp: "exclude",
    exclude: [
      { match: "morning_only", active: !(date.getHours() >= 5 && date.getHours() < 12) },
      { match: "afternoon_only", active: !(date.getHours() >= 12 && date.getHours() < 17) },
      { match: "evening_only", active: !(date.getHours() >= 17 && date.getHours() < 21) },
      { match: "night_only", active: !(date.getHours() >= 21 || date.getHours() < 5) }
    ]
  };
  const mergeTemplate = {
    merge: [
      { key: "IntroductionPartII" },
      { key: "IntroductionPartIII", active: date.getMinutes() % 2 !== 0 },
      { key: "IntroductionPartIV" }
    ]
  };
  DJM._Run(selectedKey, {
    response,
    reset: resetRequested,
    replaceTemplate,
    excludeTemplate,
    mergeTemplate: selectedKey === "Introduction" ? mergeTemplate : undefined
  })
    .then(result => {
      const r = appendNodeCheckbox.checked ? JSON.stringify(result) : result.message;
      // eslint-disable-next-line no-alert
      if (alertCheckbox.checked) alert(r);
      if (result.clearLog) textArea.textContent = "";
      textArea.append(`${r}\n`);
      resetRequested = false;
      if (textArea.selectionStart === textArea.selectionEnd) textArea.scrollTop = textArea.scrollHeight;
      selectResponse.options.length = 0;
      if (result.responses) {
        const data = result.responses;
        for (let i = 0; i < data.length; i++) selectResponse.options[selectResponse.options.length] = new Option(data[i]);
        selectResponse.disabled = responseButton.disabled = false;
      } else selectResponse.disabled = responseButton.disabled = true;
    })
    // eslint-disable-next-line no-alert
    .catch(e => alert(e.message));
}

// reloadButton.addEventListener("click", () => populateSelect());

runButton.addEventListener("click", () => run());

responseButton.addEventListener("click", () => run(selectResponse.options[selectResponse.selectedIndex].text));

resetButton.addEventListener("click", () => {
  DJM._Run(selectJsonKey.options[selectJsonKey.selectedIndex].text, { reset: true }).then(result => {
    const mode = {
      immediately: () => textArea.append(`${result.message}\n`),
      onNextRun: () => {
        resetRequested = true;
      }
    };
    textArea.textContent = "";
    selectResponse.options.length = 0;
    selectResponse.disabled = responseButton.disabled = true;
    mode.onNextRun();
  });
});

selectJsonKey.addEventListener("change", () => {
  selectResponse.options.length = 0;
  selectResponse.disabled = responseButton.disabled = true;
});

function populateSelect() {
  DJM._LoadJSONFileAsync("dynamic-messages.json", data => {
    const jsonKeys = Object.keys(data);
    selectJsonKey.options.length = 0;
    for (let i = 0; i < jsonKeys.length; i++) selectJsonKey.options[selectJsonKey.options.length] = new Option(jsonKeys[i]);
  });
}

document.addEventListener(
  "DOMContentLoaded",
  () => {
    populateSelect();
  },
  false
);
