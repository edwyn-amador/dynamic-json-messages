const DJM = (() => {
  const instanceManager = {};
  const instanceManagerHandler = {};
  let jsonFullFileName = "";
  let jsonFilePath = "";
  let jsonString = "";
  let canRefresh = true;
  let canAppendResponses = false;
  const context = {
    isChromeExt: (() => !!(chrome && chrome.extension))(),
    isContentScript: (() => !!/^https?/.test(window.location.href))()
  };
  const _LoadJSONFileAsync = async (jsonFileFullPath = "", callback = undefined) => {
    if (context.isContentScript) {
      chrome.runtime.sendMessage({ DJM_LoadJSONFileAsync: true, jsonFileFullPath }, reloadedJsonString => {
        jsonString = reloadedJsonString;
        callback(reloadedJsonString);
      });
      return;
    }
    jsonFilePath = jsonFileFullPath;
    jsonFullFileName = jsonFilePath.substr(jsonFilePath.lastIndexOf("/") + 1);
    await fetch(jsonFilePath)
      .then(response => response.json())
      .then(data => {
        jsonString = data;
      })
      .catch(error => console.log(`[DJM] Error loading "${jsonFilePath}": ${error.message}`))
      .finally(() => {
        if (callback && typeof callback === "function") callback(jsonString);
      });
  };
  const _Settings = ({ isRefreshable = true, appendResponses = false }) => {
    if (context.isContentScript) {
      chrome.runtime.sendMessage({ DJM_Settings: true, data: { isRefreshable, appendResponses } });
      return;
    }
    canRefresh = isRefreshable;
    canAppendResponses = appendResponses;
  };
  const mainWorker = new Worker(
    URL.createObjectURL(
      new Blob(
        [
          `onmessage=${e => {
            let djm;
            function setInstance(data, callback) {
              if (data.instance === undefined) {
                data.nestedNodes = [];
                data.savedInfo = {};
                data.skipToNode = {};
                data.dataAttribs = {};
                data.dataIndex = 0;
                data.retrievedResponseNodeLevel = 0;
                data.retrievedResponseValueNodeLevel = 0;
                djm = data;
              } else djm = data.instance;
              callback({
                key: data.key,
                response: data.response,
                canAppendResponses: data.canAppendResponses
              });
            }
            setInstance(e.data, data => {
              getResult(data.key, data.response, data.canAppendResponses);
            });
            function getResult(key, response, appendResponses) {
              let { jsonStringKey, reloaded, dataAttribs, dataIndex, retrievedResponseNodeLevel, retrievedResponseValueNodeLevel } = djm;
              const { nestedNodes, jsonFileName, jsonStringLoaded, savedInfo, skipToNode } = djm;
              if (response === "") recursiveIteration(jsonStringKey, 0);
              else responseFN(response);
              function sendMessage(type) {
                if (!dataAttribs["*DJM_canResponse"]) {
                  dataAttribs = undefined;
                  savedInfo.lastResponseParentNode = undefined;
                }
                djm.jsonStringKey = jsonStringKey;
                djm.reloaded = reloaded;
                djm.nestedNodes.length = nestedNodes.length;
                djm.savedInfo = savedInfo;
                djm.skipToNode = skipToNode;
                djm.dataAttribs = dataAttribs;
                djm.dataIndex = dataIndex;
                djm.retrievedResponseNodeLevel = retrievedResponseNodeLevel;
                djm.retrievedResponseValueNodeLevel = retrievedResponseValueNodeLevel;
                postMessage({ type, data: djm });
              }
              function updateNextResponseNode(returnedResponse, parentResponseNodeId, parentResponseNodeLevel, returnedResponseNodeLevel) {
                skipToNode[returnedResponse][parentResponseNodeId] = { parentResponseNodeLevel, returnedResponseNodeLevel };
              }
              function updateNextSequenceNode(parentSequenceNodeId, sequenceNodeLevel, updateOnNextTime) {
                skipToNode[parentSequenceNodeId] = { sequenceNodeLevel, updateOnNextTime };
              }
              function hasObjectPropertyLightweightExtended(object, property, checkParentLength = false) {
                const value = object[property];
                const exists = value !== undefined;
                return { exists, value, parentLength: checkParentLength ? Object.values(object).length : undefined };
              }
              function getNextAlternateSequenceNode(currentNode) {
                if (skipToNode[currentNode["*DJM_sequenceId"]] === undefined) updateNextSequenceNode(currentNode["*DJM_sequenceId"], 0);
                let firstSequenceNodeIndex;
                let nextSequenceNodeIndex;
                const sequenceLength = currentNode.sequence.length;
                for (let i = 0; i < sequenceLength; i++) {
                  if (firstSequenceNodeIndex === undefined) firstSequenceNodeIndex = i;
                  if (i > skipToNode[currentNode["*DJM_sequenceId"]].sequenceNodeLevel) {
                    nextSequenceNodeIndex = i;
                    break;
                  }
                  if (i === sequenceLength - 1) nextSequenceNodeIndex = firstSequenceNodeIndex;
                }
                return nextSequenceNodeIndex;
              }
              function getNextResponseNode(returnedResponse, isFirstTime) {
                let firstResponseNodeIndex;
                let nextResponseNodeIndex;
                let firstReturnedResponseValueNodeIndex;
                let nextReturnedResponseValueNodeIndex;
                const lastSkipToResponseNode = skipToNode[returnedResponse][savedInfo.responseId];
                const lastResponseParentNodeResponseLength = savedInfo.lastResponseParentNode.response.length;
                for (let i = 0; i < lastResponseParentNodeResponseLength; i++) {
                  savedInfo.lastResponseParentNode.response[i]["*isResponseLevel"] = true;
                  const currentReturnedResponseValueNode = savedInfo.lastResponseParentNode.response[i][returnedResponse];
                  if (currentReturnedResponseValueNode) {
                    const currentReturnedResponseValueLength = currentReturnedResponseValueNode.length;
                    for (let j = 0; j < currentReturnedResponseValueLength; j++) {
                      if (firstResponseNodeIndex === undefined) firstResponseNodeIndex = i;
                      if (firstReturnedResponseValueNodeIndex === undefined) firstReturnedResponseValueNodeIndex = j;
                      if (
                        (i === lastSkipToResponseNode.parentResponseNodeLevel && j > lastSkipToResponseNode.returnedResponseNodeLevel) ||
                        (isFirstTime && j >= lastSkipToResponseNode.returnedResponseNodeLevel) ||
                        i > lastSkipToResponseNode.parentResponseNodeLevel
                      ) {
                        nextResponseNodeIndex = i;
                        nextReturnedResponseValueNodeIndex = j;
                        break;
                      }
                    }
                  }
                  if (nextResponseNodeIndex !== undefined) break;
                  if (i === lastResponseParentNodeResponseLength - 1) {
                    nextResponseNodeIndex = firstResponseNodeIndex;
                    nextReturnedResponseValueNodeIndex = firstReturnedResponseValueNodeIndex;
                    savedInfo.lastResponseParentNode.response[nextResponseNodeIndex]["*DJM_skipped"] = undefined;
                    savedInfo.lastResponseParentNode.response[nextResponseNodeIndex][returnedResponse][nextReturnedResponseValueNodeIndex][
                      "*DJM_skipped"
                    ] = undefined;
                  } else savedInfo.lastResponseParentNode.response[i]["*DJM_skipped"] = true;
                }
                return {
                  parentResponseNodeLevel: nextResponseNodeIndex,
                  returnedResponseValueNodeLevel: nextReturnedResponseValueNodeIndex
                };
              }
              function responseFN(returnedResponse) {
                if (dataAttribs === undefined || !dataAttribs["*DJM_canResponse"]) return;
                if (dataAttribs.response.length === undefined)
                  throw new Error(`["${jsonFileName}" >> "${key}"]\nAll 'response' nested properties must be enclosed as array.`);
                if (skipToNode[returnedResponse] === undefined) skipToNode[returnedResponse] = {};
                const isFirstTime = skipToNode[returnedResponse][savedInfo.responseId] === undefined;
                if (isFirstTime) updateNextResponseNode(returnedResponse, savedInfo.responseId, 0, 0);
                const { parentResponseNodeLevel, returnedResponseValueNodeLevel } = getNextResponseNode(returnedResponse, isFirstTime);
                if (returnedResponseValueNodeLevel === undefined) return;
                updateNextResponseNode(returnedResponse, savedInfo.responseId, parentResponseNodeLevel, returnedResponseValueNodeLevel);
                retrievedResponseNodeLevel = skipToNode[returnedResponse][savedInfo.responseId].parentResponseNodeLevel;
                retrievedResponseValueNodeLevel = skipToNode[returnedResponse][savedInfo.responseId].returnedResponseNodeLevel;
                dataAttribs["*DJM_canResponse"] = dataAttribs["*DJM_skipped"] = undefined;
                dataAttribs["*DJM_returnedResponse"] = returnedResponse;
                savedInfo.lastReturnedResponse = returnedResponse;
                savedInfo.hasResponded = true;
                nestedNodes[nestedNodes.length] = dataAttribs;
                recursiveIteration(dataAttribs.response, retrievedResponseNodeLevel, true, dataAttribs["*DJM_returnedResponse"]);
              }
              function recursiveIteration(
                data,
                startFromIndex = 0,
                retrieveReturnedResponseNode,
                returnedResponse,
                isResponse,
                isSequence
              ) {
                try {
                  if (!jsonStringLoaded) throw new Error(`["${jsonFileName}" >> "${key}"]\nJSON file not loaded.`);
                  else if (data === undefined)
                    throw new Error(`["${jsonFileName}" >> "${key}"]\nThere's no data for the specified JSON key.`);

                  dataIndex = startFromIndex;
                  dataAttribs = data[dataIndex];
                  const currentNodeIndex = dataIndex;

                  const sequenceProperty = hasObjectPropertyLightweightExtended(dataAttribs, "sequence", true);
                  const responseProperty = hasObjectPropertyLightweightExtended(dataAttribs, "response");
                  const repeatResponseProperty = hasObjectPropertyLightweightExtended(dataAttribs, "*repeatResponse");
                  const requiredProperty = hasObjectPropertyLightweightExtended(dataAttribs, "*required");
                  const alternateProperty = hasObjectPropertyLightweightExtended(dataAttribs, "*alternate");

                  let hasShown = dataAttribs && dataAttribs["*DJM_shown"] !== undefined;
                  const hasFinished = dataAttribs && dataAttribs["*DJM_finished"] !== undefined;
                  let hasSkipped = dataAttribs && dataAttribs["*DJM_skipped"] !== undefined;

                  if (!hasShown) {
                    if (sequenceProperty.exists) {
                      const sequenceLength = dataAttribs.sequence.length;
                      if (sequenceLength === undefined)
                        throw new Error(`["${jsonFileName}" >> "${key}"]\nAll 'sequence' nested nodes must be enclosed as array.`);
                      else if (sequenceLength === 0)
                        throw new Error(`["${jsonFileName}" >> "${key}"]\nAt least must exist one sequence nested node.`);
                    } else if (responseProperty.exists) {
                      const responseLength = dataAttribs.response.length;
                      if (responseLength === undefined)
                        throw new Error(`["${jsonFileName}" >> "${key}"]\nAll 'response' nested nodes must be enclosed as array.`);
                      else if (responseLength === 0)
                        throw new Error(
                          `["${jsonFileName}" >> "${key}"]\nAt least must exist one response value node on 'response' nested node.`
                        );
                    } else {
                      const dataLength = data.length;
                      if (dataLength === undefined)
                        throw new Error(`["${jsonFileName}" >> "${key}"]\nAll nodes must be enclosed as array.`);
                      else if (dataLength === 0) throw new Error(`["${jsonFileName}" >> "${key}"]\nCan't exist empty nodes.`);
                    }
                    if (responseProperty.exists && sequenceProperty.exists)
                      throw new Error(
                        `["${jsonFileName}" >> "${key}"]\nNodes must not have both 'response' and 'sequence' properties at the same time.`
                      );
                    if (!responseProperty.exists && repeatResponseProperty.exists)
                      throw new Error(
                        `["${jsonFileName}" >> "${key}"]\nThe '*repeatResponse' property must exist on parent response nodes only.`
                      );
                    if (!responseProperty.exists && requiredProperty.exists)
                      throw new Error(
                        `["${jsonFileName}" >> "${key}"]\nThe '*required' property must exist on parent response nodes only.`
                      );
                    else if (!sequenceProperty.exists && alternateProperty.exists)
                      throw new Error(
                        `["${jsonFileName}" >> "${key}"]\nThe '*alternate' property must exist on parent sequence nodes only.`
                      );

                    if (nestedNodes.length === 0) {
                      if (reloaded) reloaded = JSON.parse(JSON.stringify(reloaded));
                      savedInfo.rootNodeIndex = ++savedInfo.rootNodeIndex || 0;
                      retrievedResponseNodeLevel = 0;
                    }
                    savedInfo.resultObject = JSON.parse(JSON.stringify(dataAttribs));
                    dataAttribs["*DJM_shown"] = false;
                  }
                  if (!hasFinished) dataAttribs["*DJM_finished"] = false;
                  if (responseProperty.exists) savedInfo.isRepeatResponse = undefined;

                  if (responseProperty.exists && dataAttribs["*DJM_shown"]) {
                    dataAttribs["*DJM_canResponse"] = undefined;

                    const responseLength = dataAttribs.response.length;
                    for (let i = 0; i < responseLength; i++) {
                      dataIndex = i;
                      if (!dataAttribs.response[i]["*DJM_finished"] && !dataAttribs.response[i]["*DJM_skipped"]) break;
                    }

                    if (savedInfo.canFlow) {
                      nestedNodes[nestedNodes.length] = dataAttribs;
                      recursiveIteration(dataAttribs.response, dataIndex, true, dataAttribs["*DJM_returnedResponse"], true);
                      return;
                    }

                    if (!savedInfo.hasResponded) {
                      let hasPreviousPendingSequence = false;
                      const nestedNodesFixedLength = nestedNodes.length - 1;
                      for (let i = nestedNodesFixedLength; i >= 0; i--) {
                        const nestedNode = nestedNodes[i];
                        if (nestedNode.sequence) {
                          const currentSequenceId = nestedNode["*DJM_sequenceId"];
                          if (nestedNode["*alternate"])
                            updateNextSequenceNode(
                              currentSequenceId,
                              skipToNode[currentSequenceId] !== undefined ? skipToNode[currentSequenceId].sequenceNodeLevel : 0,
                              true
                            );
                          else {
                            const sequenceLength = nestedNode.sequence.length;
                            for (let j = 0; j < sequenceLength; j++) {
                              hasSkipped = nestedNode.sequence[j]["*DJM_skipped"] !== undefined;
                              hasShown = nestedNode.sequence[j]["*DJM_shown"] !== undefined;
                              if (!hasSkipped && !hasShown) {
                                updateNextSequenceNode(`${currentSequenceId}:P`, j);
                                hasPreviousPendingSequence = true;
                                break;
                              }
                            }
                          }
                        }
                        if (hasPreviousPendingSequence) break;
                      }

                      nestedNodes.length = 0;
                      savedInfo.responseHasPendingAlternateFromParent = undefined;
                      if (hasPreviousPendingSequence) {
                        savedInfo.canFlow = true;
                        recursiveIteration(jsonStringKey, 0);
                      } else {
                        jsonStringKey.shift();
                        if (jsonStringKey.length === 0) {
                          savedInfo.rootNodeIndex = undefined;
                          savedInfo.lastResponseParentNode = undefined;
                          retrievedResponseNodeLevel = 0;
                          retrievedResponseValueNodeLevel = 0;
                          savedInfo.responseId = undefined;
                          savedInfo.lastReturnedResponse = undefined;
                          savedInfo.lastSequenceIsAlternate = undefined;
                          savedInfo.canFlow = undefined;
                          jsonStringKey = reloaded;
                          recursiveIteration(jsonStringKey, 0);
                          return;
                        }
                        recursiveIteration(jsonStringKey, 0);
                      }
                      return;
                    }
                  }

                  if (retrieveReturnedResponseNode) {
                    const returnedResponseLength = dataAttribs[returnedResponse].length;
                    if (returnedResponseLength === undefined)
                      throw new Error(
                        `["${jsonFileName}" >> "${key}"]\nAll returned response value nested properties must be enclosed as array.`
                      );
                    for (let i = 0; i < returnedResponseLength; i++) {
                      dataIndex = i;
                      if (returnedResponseLength > 1 && retrievedResponseValueNodeLevel > 0 && i < retrievedResponseValueNodeLevel)
                        dataAttribs[returnedResponse][i]["*DJM_skipped"] = true;
                      if (!dataAttribs[returnedResponse][i]["*DJM_finished"] && !dataAttribs[returnedResponse][i]["*DJM_skipped"]) break;
                    }
                    dataAttribs["*DJM_shown"] = true;
                    nestedNodes[nestedNodes.length] = dataAttribs;
                    recursiveIteration(dataAttribs[returnedResponse], dataIndex, false, returnedResponse, true);
                    return;
                  }

                  if (
                    (dataAttribs["*DJM_shown"] && sequenceProperty.exists) ||
                    (sequenceProperty.exists &&
                      (sequenceProperty.parentLength === 1 || (alternateProperty.exists && sequenceProperty.parentLength === 2)))
                  ) {
                    dataAttribs["*DJM_shown"] = true;
                    let hasSkipNodeDefinition = false;
                    if (!savedInfo.responseHasPendingAlternateFromParent)
                      dataAttribs["*DJM_sequenceId"] = `root:${
                        savedInfo.rootNodeIndex
                      }-parent_response:${retrievedResponseNodeLevel}-index:${currentNodeIndex}-level:${nestedNodes.length}`;
                    const currentSequenceId = dataAttribs["*DJM_sequenceId"];
                    const isAlternate = (dataAttribs["*alternate"] = !!+dataAttribs["*alternate"]);
                    if (isAlternate) {
                      savedInfo.lastSequenceIsAlternate = true;
                      hasSkipNodeDefinition = skipToNode[currentSequenceId] !== undefined;
                      if (hasSkipNodeDefinition && skipToNode[currentSequenceId].updateOnNextTime)
                        updateNextSequenceNode(currentSequenceId, getNextAlternateSequenceNode(dataAttribs));
                    }
                    const sequenceLength = dataAttribs.sequence.length;
                    for (let i = 0; i < sequenceLength; i++) {
                      dataIndex = i;
                      if (isAlternate) {
                        if (hasSkipNodeDefinition && i < skipToNode[currentSequenceId].sequenceNodeLevel)
                          dataAttribs.sequence[i]["*DJM_skipped"] = true;
                      }
                      if (skipToNode[`${currentSequenceId}:P`] !== undefined)
                        if (i < skipToNode[`${currentSequenceId}:P`].sequenceNodeLevel) dataAttribs.sequence[i]["*DJM_skipped"] = true;
                        else skipToNode[`${currentSequenceId}:P`] = undefined;
                      if (
                        dataAttribs.sequence[i]["*DJM_canResponse"] ||
                        (!dataAttribs.sequence[i]["*DJM_finished"] &&
                          !dataAttribs.sequence[i]["*DJM_skipped"] &&
                          !dataAttribs.sequence[i]["*DJM_done"])
                      )
                        break;
                    }
                    if (!savedInfo.responseHasPendingAlternateFromParent) nestedNodes[nestedNodes.length] = dataAttribs;
                    recursiveIteration(dataAttribs.sequence, dataIndex, undefined, undefined, undefined, true);
                    return;
                  }

                  if (!dataAttribs["*DJM_shown"]) {
                    savedInfo.resultObject.isSequence = isSequence;
                    if (isSequence && savedInfo.isAlternate) {
                      savedInfo.resultObject.isAlternate = true;
                      savedInfo.isAlternate = undefined;
                    }
                    savedInfo.resultObject.isResponse = isResponse;
                    savedInfo.resultObject.response = isResponse ? returnedResponse : undefined;
                    if (responseProperty.exists) savedInfo.resultObject.hasResponse = true;
                    if (isResponse && savedInfo.isRepeatResponse) {
                      savedInfo.resultObject.isRepeatResponse = true;
                      savedInfo.isRepeatResponse = undefined;
                    }
                    if (sequenceProperty.exists) {
                      savedInfo.resultObject.hasSequence = true;
                      savedInfo.resultObject.sequence = undefined;
                    }
                    if (alternateProperty.exists) {
                      if (+alternateProperty.value) {
                        savedInfo.isAlternate = true;
                        savedInfo.resultObject.hasAlternate = true;
                      }
                      savedInfo.resultObject["*alternate"] = undefined;
                    }
                    if (repeatResponseProperty.exists) {
                      if (+repeatResponseProperty.value) {
                        savedInfo.isRepeatResponse = true;
                        savedInfo.resultObject.hasRepeatResponse = true;
                      }
                      savedInfo.resultObject["*repeatResponse"] = undefined;
                    }
                    if (requiredProperty.exists) {
                      const requiredValue = requiredProperty.value;
                      const isObject = obj => obj && obj.constructor && obj.constructor === Object;
                      const isBooleanRequired = !!+requiredValue;
                      savedInfo.resultObject.hasRequired = isBooleanRequired || isObject(requiredValue);
                      savedInfo.resultObject["*required"] = undefined;
                      savedInfo.requiredResult =
                        savedInfo.resultObject.hasRequired && isBooleanRequired ? savedInfo.resultObject : requiredValue;
                    }
                    dataAttribs["*DJM_shown"] = true;
                    if (!sequenceProperty.exists && !responseProperty.exists) dataAttribs["*DJM_finished"] = true;
                    if (sequenceProperty.exists) savedInfo.canFlow = savedInfo.lastReturnedResponse !== undefined;
                    else if (responseProperty.exists) {
                      dataAttribs["*DJM_canResponse"] = dataAttribs["*DJM_skipped"] = true;
                      savedInfo.canFlow = undefined;
                      savedInfo.hasResponded = undefined;
                      savedInfo.responseId = dataAttribs["*DJM_responseId"] = `root:${
                        savedInfo.rootNodeIndex
                      }-index:${currentNodeIndex}-response:${retrievedResponseNodeLevel}-${
                        savedInfo.responseId === undefined || savedInfo.lastReturnedResponse === undefined
                          ? "default"
                          : savedInfo.lastReturnedResponse
                      }:${nestedNodes.length}`;
                      savedInfo.lastResponseParentNode = dataAttribs;
                      savedInfo.responseHasPendingAlternateFromParent = savedInfo.lastSequenceIsAlternate;
                      if (appendResponses) {
                        const responses = dataAttribs.response.map(p => Object.keys(p)).reduce((a, b) => a.concat(b));
                        savedInfo.resultObject.responses = responses.filter((v, i) => responses.indexOf(v) === i);
                      }
                      sendMessage("result");
                      return;
                    }
                    let hasPendingSequence = false;
                    let returnedResponseValueNodeHasFinished = false;
                    const nestedNodesFixedLength = nestedNodes.length - 1;
                    for (let i = nestedNodesFixedLength; i >= 0; i--) {
                      const nestedNode = nestedNodes[i];
                      const hasSequenceProperty = nestedNode.sequence !== undefined;
                      const sequenceParentNodeIsAlternate = nestedNode["*alternate"];
                      const hasResponseProperty = nestedNode.response !== undefined;
                      isResponse = nestedNode["*isResponseLevel"];
                      if (isResponse && !returnedResponseValueNodeHasFinished) {
                        let skipCounter = 0;
                        const lastReturnedResponseLength = nestedNode[savedInfo.lastReturnedResponse].length;
                        for (let j = 0; j < lastReturnedResponseLength; j++) {
                          hasSkipped = nestedNode[savedInfo.lastReturnedResponse][j]["*DJM_skipped"] !== undefined;
                          if (hasSkipped) skipCounter++;
                          if (nestedNode[savedInfo.lastReturnedResponse][j]["*DJM_finished"]) {
                            returnedResponseValueNodeHasFinished = true;
                            break;
                          }
                        }
                        nestedNode["*DJM_finished"] =
                          skipCounter + (returnedResponseValueNodeHasFinished ? 1 : 0) === lastReturnedResponseLength;
                      } else if (hasSequenceProperty) {
                        hasPendingSequence = true;
                        const sequenceFixedLength = nestedNode.sequence.length - 1;
                        for (let j = sequenceFixedLength; j >= 0; j--) {
                          if (
                            !nestedNode.sequence[j]["*DJM_finished"] &&
                            !nestedNode.sequence[j]["*DJM_skipped"] &&
                            !nestedNode.sequence[j]["*DJM_done"]
                          )
                            if (!nestedNode["*alternate"] || nestedNode.sequence[j]["*DJM_shown"]) break;
                          nestedNode["*DJM_finished"] = j === 0;
                          hasPendingSequence = !nestedNode["*DJM_finished"];
                        }
                      } else if (hasResponseProperty) {
                        if (returnedResponseValueNodeHasFinished) nestedNode["*DJM_done"] = true;
                        else {
                          const maxIndex = nestedNode.response.length - 1;
                          nestedNode["*DJM_finished"] =
                            nestedNode.response[maxIndex]["*DJM_finished"] || nestedNode.response[maxIndex]["*DJM_skipped"];
                        }
                      }
                      if (sequenceParentNodeIsAlternate && (nestedNode["*DJM_finished"] || nestedNode["*DJM_skipped"])) {
                        currentSequenceId = nestedNode["*DJM_sequenceId"];
                        updateNextSequenceNode(
                          currentSequenceId,
                          skipToNode[currentSequenceId] !== undefined ? skipToNode[currentSequenceId].sequenceNodeLevel : 0,
                          true
                        );
                      }
                      if (returnedResponseValueNodeHasFinished && hasPendingSequence) break;
                    }

                    const returnedResponseFinished = returnedResponseValueNodeHasFinished && !hasPendingSequence;
                    if (jsonStringKey[0]["*DJM_finished"] || jsonStringKey[0]["*DJM_skipped"] || returnedResponseFinished)
                      jsonStringKey.shift();
                    if (returnedResponseFinished) savedInfo.responseId = undefined;
                    savedInfo.responseHasPendingAlternateFromParent = undefined;
                    retrievedResponseNodeLevel = 0;
                    retrievedResponseValueNodeLevel = 0;
                    nestedNodes.length = 0;
                    if (jsonStringKey.length === 0) {
                      savedInfo.rootNodeIndex = undefined;
                      savedInfo.responseId = undefined;
                      savedInfo.lastResponseParentNode = undefined;
                      savedInfo.lastSequenceIsAlternate = undefined;
                      jsonStringKey = reloaded;
                      reloaded = undefined;
                    }
                    sendMessage("result");
                    return;
                  }
                } catch (error) {
                  savedInfo.resultObject = error.message;
                  sendMessage("exception");
                }
              }
            }
          }}`
        ],
        { type: "application/javascript" }
      )
    )
  );
  const _Run = async (key = "", { response = "", lock = false, reset = false } = {}) => {
    if (context.isContentScript)
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ DJM_Run: true, data: { key, response, lock, reset } }, result => {
          const { success, error } = result;
          if (success) resolve(success);
          else reject(error);
        });
      });
    let originalResolve;
    let originalReject;
    async function reloadRecall(reloaded) {
      instanceManager[key].jsonStringKey = reloaded;
      start();
    }
    async function start() {
      return new Promise(async (resolve, reject) => {
        originalResolve = originalResolve || resolve;
        originalReject = originalReject || reject;
        if (jsonString === "") {
          originalReject(`First load "DJM._LoadJSONFileAsync()"`);
          return;
        }
        let keyInstance;
        if (reset) response = (instanceManager[key] = instanceManagerHandler[key] = undefined) || "";
        else if (instanceManagerHandler[key] && response === "") {
          keyInstance = instanceManager[key] = instanceManagerHandler[key];
          instanceManagerHandler[key] = undefined;
        } else keyInstance = instanceManager[key];
        if (keyInstance) {
          if (keyInstance.isLoadingJsonFile) {
            setTimeout(() => start(), 0);
            return;
          }
          if (lock) {
            sendResult(keyInstance.savedInfo.resultObject);
            return;
          }
          if (keyInstance.savedInfo.requiredResult)
            if (response !== "") keyInstance.savedInfo.requiredResult = undefined;
            else {
              keyInstance.savedInfo.requiredResult.isRequired = (keyInstance.savedInfo.requiredResult.hasRequired = undefined) || true;
              if (canAppendResponses) keyInstance.savedInfo.requiredResult.responses = keyInstance.savedInfo.resultObject.responses;
              originalResolve(keyInstance.savedInfo.requiredResult);
              return;
            }
          if (keyInstance.canPrepareReloaded) instanceManager[key].reloaded = jsonString[key];
          else instanceManager[key].reloaded = undefined;
        }
        mainWorker.postMessage(
          keyInstance === undefined
            ? {
                key,
                jsonFileName: jsonFullFileName,
                jsonStringLoaded: jsonString !== "",
                jsonStringKey: jsonString[key],
                response,
                canAppendResponses
              }
            : {
                key,
                instance: keyInstance,
                response,
                canAppendResponses
              }
        );
        mainWorker.onmessage = e => {
          const { type, data } = e.data;
          if (type === "result") {
            const { resultObject } = data.savedInfo;
            const jsonStringKeyLength = data.jsonStringKey.length;
            let reloadedPrepared;
            if (resultObject.isRepeatResponse) {
              instanceManagerHandler[key] = {};
              if (canAppendResponses) data.savedInfo.resultObject.responses = instanceManager[key].savedInfo.resultObject.responses;
              instanceManagerHandler[key] = data;
              reloadedPrepared = instanceManagerHandler[key].canPrepareReloaded && instanceManagerHandler[key].reloaded;
              instanceManagerHandler[key].canPrepareReloaded = jsonStringKeyLength === 1;
            } else {
              instanceManager[key] = data;
              reloadedPrepared = instanceManager[key].canPrepareReloaded && instanceManager[key].reloaded;
              instanceManager[key].canPrepareReloaded = jsonStringKeyLength === 1;
            }
            if (!reloadedPrepared && jsonStringKeyLength <= 1 && canRefresh) {
              const isOneNodeOnlyAndHasFinished = jsonStringKeyLength === 0;
              if (instanceManagerHandler[key]) instanceManagerHandler[key].isLoadingJsonFile = true;
              else instanceManager[key].isLoadingJsonFile = true;
              _LoadJSONFileAsync(jsonFilePath, reloadedJsonString => {
                if (isOneNodeOnlyAndHasFinished)
                  if (instanceManagerHandler[key]) instanceManagerHandler[key].jsonStringKey = reloadedJsonString[key];
                  else instanceManager[key].jsonStringKey = reloadedJsonString[key];
                if (instanceManagerHandler[key]) instanceManagerHandler[key].isLoadingJsonFile = undefined;
                else instanceManager[key].isLoadingJsonFile = undefined;
              });
            }
            originalResolve(resultObject);
          } else if (type === "recall") {
            instanceManager[key] = data;
            if (canRefresh) _LoadJSONFileAsync(jsonFilePath, reloadedJsonString => reloadRecall(reloadedJsonString[key]));
            else reloadRecall(jsonString[key]);
          } else if (type === "exception") {
            const { resultObject } = data.savedInfo;
            instanceManager[key] = data;
            originalReject(resultObject);
          }
        };
      });
    }
    return start()
      .then(result => result)
      .catch(error => {
        throw new Error(error);
      });
  };
  if (context.isChromeExt)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.DJM_IsJSONFileLoaded) sendResponse(jsonString !== "");
      else if (request.DJM_LoadJSONFileAsync) {
        const { jsonFileFullPath } = request;
        if (jsonString === "") _LoadJSONFileAsync(jsonFileFullPath, sendResponse);
        else sendResponse(jsonString);
      } else if (request.DJM_Settings) {
        const { isRefreshable, appendResponses } = request.data;
        _Settings({ isRefreshable, appendResponses });
      } else if (request.DJM_Run) {
        const { key, response, excludeTemplate, lock, reset } = request.data;
        _Run(key, { response, excludeTemplate, lock, reset })
          .then(success => sendResponse({ success }))
          .catch(error => sendResponse({ error }));
      }
      return true;
    });
  return {
    _LoadJSONFileAsync,
    _Run,
    _Settings,
    _IsJSONFileLoadedAsCallback: callback => {
      if (context.isChromeExt && context.isContentScript)
        chrome.runtime.sendMessage({ DJM_IsJSONFileLoaded: true }, result => callback(result));
      else callback(jsonString !== "");
    }
  };
})();
