const DJM = (() => {
  const instanceManager = {};
  const instanceManagerHandler = {};
  const mergeTemplateManager = {};
  const pendingJsonStringKeyUpdate = {};
  let jsonFullFileName = "";
  let jsonFilePath = "";
  let jsonString = "";
  let canRefresh = true;
  let canAppendResponses = false;
  let isReplaceOnWorker = false;
  let isMergeOnWorker = false;
  const _LoadJSONFileAsync = async (jsonFileFullPath = "", callback = undefined) => {
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
  const _Settings = ({ isRefreshable = true, appendResponses = false, replaceOnWorker = false, mergeOnWorker = false }) => {
    canRefresh = isRefreshable;
    canAppendResponses = appendResponses;
    isReplaceOnWorker = replaceOnWorker;
    isMergeOnWorker = mergeOnWorker;
  };
  const applyDebounce = callback => {
    let timeout;
    return async (
      key = "",
      { waitTime = 300, response = "", replaceTemplate, excludeTemplate, mergeTemplate, lock = false, reset = false } = {}
    ) => {
      clearTimeout(timeout);
      return new Promise(resolve => {
        timeout = setTimeout(
          () => resolve(callback(key, { response, replaceTemplate, excludeTemplate, mergeTemplate, lock, reset })),
          waitTime
        );
      });
    };
  };
  const keySwapper = (...args) => {
    const [mainKey, mergeTemplate] = args;
    let [, , mainKeyManager] = args;
    let nextKey = mainKey;
    let mainKeyRepeated = false;
    const mergeDefintion = mergeTemplate.merge;
    if (mergeDefintion) {
      const mergeDefintionLength = mergeDefintion.length;
      for (let i = 0; i < mergeDefintionLength; i++) {
        const definition = mergeDefintion[i];
        const isActive = !!+definition.active;
        if ((definition.active === undefined || isActive) && i > mainKeyManager.lastKeyIndex) {
          mainKeyManager.lastKeyIndex = i;
          nextKey = definition.key;
          mainKeyRepeated = nextKey === mainKey;
          break;
        }
        if (i === mergeDefintionLength - 1) {
          mainKeyManager = {};
          mainKeyManager.lastKeyIndex = -1;
          mainKeyManager.canUpdateJsonString = true;
          mainKeyManager.lastUpdatedKey = undefined;
        }
      }
    }
    mainKeyManager.swappedKey = nextKey;
    return { nextKey, mainKeyManager, mainKeyRepeated };
  };
  const keySwapperWorker = new Worker(
    URL.createObjectURL(
      new Blob([`onmessage = e => postMessage((${keySwapper.toString()}).call(this, ...e.data));`], { type: "application/javascript" })
    )
  );
  const replace = (...args) => {
    const [result, replaceTemplate] = args;
    let keyValue = result[replaceTemplate.onProp];
    const replaceDefinition = replaceTemplate.replace;
    if (keyValue && replaceDefinition) {
      const replaceLength = replaceDefinition.length;
      for (let i = 0; i < replaceLength; i++) {
        const { here, to } = replaceTemplate.replace[i];
        result[replaceTemplate.onProp] = keyValue = keyValue.replace(here, to);
      }
    }
    return result;
  };
  const replaceWorker = new Worker(
    URL.createObjectURL(
      new Blob([`onmessage = e => postMessage((${replace.toString()}).call(this, ...e.data));`], { type: "application/javascript" })
    )
  );
  const _TemplateGenerator = (() => ({
    _Exclude: (onProperty = "") => {
      const excludeDefinition = [];
      return {
        _AddExclude: (match = "", active = undefined) => {
          excludeDefinition[excludeDefinition.length] = { match, active };
        },
        _GetTemplate: () => ({
          onProp: onProperty,
          exclude: excludeDefinition
        })
      };
    },
    _Merge: () => {
      const mergeDefinition = [];
      return {
        _AddKey: (key = "", active = undefined) => {
          mergeDefinition[mergeDefinition.length] = { key, active };
        },
        _GetTemplate: () => ({
          merge: mergeDefinition
        })
      };
    },
    _Replace: (onProperty = "") => {
      const replaceDefinition = [];
      return {
        _AddReplace: (here = "", to = "") => {
          replaceDefinition[replaceDefinition.length] = { here, to };
        },
        _GetTemplate: () => ({
          onProp: onProperty,
          replace: replaceDefinition
        })
      };
    }
  }))();
  const mainWorker = new Worker(
    URL.createObjectURL(
      new Blob(
        [
          `onmessage=${e => {
            let djm;
            const contextManager = {};
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
                handledKey: data.handledKey,
                response: data.response,
                excludeTemplate: data.excludeTemplate,
                canAppendResponses: data.canAppendResponses
              });
            }
            setInstance(e.data, data => {
              getResult(data.key, data.handledKey, data.response, data.excludeTemplate, data.canAppendResponses);
            });
            function getResult(key, handledKey, response, excludeTemplate, appendResponses) {
              let { jsonStringKey, reloaded, dataAttribs, dataIndex, retrievedResponseNodeLevel, retrievedResponseValueNodeLevel } = djm;
              const { nestedNodes, jsonFileName, jsonStringLoaded, savedInfo, skipToNode } = djm;
              if (savedInfo.allNodesExcluded) {
                djm.savedInfo.allNodesExcluded = undefined;
                postMessage({ type: "recall", swapKey: handledKey, data: djm });
              } else if (!contextManager.isExcluded && response === "") recursiveIteration(jsonStringKey, 0);
              else if (response !== "") responseFN(response);
              function sendMessage(type, swapKey) {
                if (!dataAttribs["*DJM_canResponse"]) {
                  dataAttribs = undefined;
                  savedInfo.lastResponseParentNode = undefined;
                }
                savedInfo.resultSentBefore = type === "result";
                djm.excludeTemplate = undefined;
                djm.jsonStringKey = jsonStringKey;
                djm.reloaded = reloaded;
                djm.nestedNodes.length = nestedNodes.length;
                djm.savedInfo = savedInfo;
                djm.skipToNode = skipToNode;
                djm.dataAttribs = dataAttribs;
                djm.dataIndex = dataIndex;
                djm.retrievedResponseNodeLevel = retrievedResponseNodeLevel;
                djm.retrievedResponseValueNodeLevel = retrievedResponseValueNodeLevel;
                postMessage({ type, swapKey, data: djm });
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
              function checkIfExcluded(currentNode, isCheckingForResponse = false) {
                let nodeHasOnProp = false;
                let excluded = false;
                if (excludeTemplate) {
                  const excludeTemplateProperty = excludeTemplate.onProp;
                  const excludeTemplateExclude = excludeTemplate.exclude;
                  if (excludeTemplateProperty && excludeTemplateExclude) {
                    const definitionPropertyProperty = hasObjectPropertyLightweightExtended(currentNode, excludeTemplateProperty);
                    nodeHasOnProp = !nodeHasOnProp ? definitionPropertyProperty.exists : nodeHasOnProp;
                    if (!nodeHasOnProp) return { nodeHasOnProp, excluded };
                    const definitionLength = excludeTemplateExclude.length;
                    for (let i = 0; i < definitionLength; i++) {
                      const { match, active } = excludeTemplateExclude[i];
                      const matches = definitionPropertyProperty.value === match;
                      const isActive = !!+active;
                      excluded = (matches && active === undefined) || (matches && isActive);
                      if (excluded) {
                        currentNode["*DJM_finished"] = !isCheckingForResponse;
                        break;
                      }
                    }
                  }
                }
                return { nodeHasOnProp, excluded: currentNode["*DJM_hasPendingResponse"] ? false : excluded };
              }
              function getNextAlternateSequenceNode(currentNode) {
                if (skipToNode[currentNode["*DJM_sequenceId"]] === undefined) updateNextSequenceNode(currentNode["*DJM_sequenceId"], 0);
                let firstSequenceNodeIndex;
                let nextSequenceNodeIndex;
                const sequenceLength = currentNode.sequence.length;
                for (let i = 0; i < sequenceLength; i++) {
                  if (!checkIfExcluded(currentNode.sequence[i]).excluded) {
                    if (firstSequenceNodeIndex === undefined) firstSequenceNodeIndex = i;
                    if (i > skipToNode[currentNode["*DJM_sequenceId"]].sequenceNodeLevel) {
                      nextSequenceNodeIndex = i;
                      break;
                    }
                  }
                  if (i === sequenceLength - 1) nextSequenceNodeIndex = firstSequenceNodeIndex;
                }
                return nextSequenceNodeIndex;
              }
              function getNextResponseNode(returnedResponse, isFirstTime) {
                contextManager.allReturnedResponseExcluded = undefined;
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
                      if (!checkIfExcluded(currentReturnedResponseValueNode[j], true).excluded) {
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
                  }
                  if (nextResponseNodeIndex !== undefined) break;
                  if (i === lastResponseParentNodeResponseLength - 1) {
                    nextResponseNodeIndex = firstResponseNodeIndex;
                    nextReturnedResponseValueNodeIndex = firstReturnedResponseValueNodeIndex;
                    contextManager.allReturnedResponseExcluded =
                      nextResponseNodeIndex === undefined && nextReturnedResponseValueNodeIndex === undefined;
                    if (!contextManager.allReturnedResponseExcluded) {
                      savedInfo.lastResponseParentNode.response[nextResponseNodeIndex]["*DJM_skipped"] = undefined;
                      savedInfo.lastResponseParentNode.response[nextResponseNodeIndex][returnedResponse][
                        nextReturnedResponseValueNodeIndex
                      ]["*DJM_skipped"] = undefined;
                    }
                  } else savedInfo.lastResponseParentNode.response[i]["*DJM_skipped"] = true;
                }
                return {
                  parentResponseNodeLevel: nextResponseNodeIndex,
                  returnedResponseValueNodeLevel: nextReturnedResponseValueNodeIndex
                };
              }
              function responseFN(returnedResponse) {
                if (
                  dataAttribs === undefined ||
                  !dataAttribs["*DJM_canResponse"] ||
                  (contextManager.isExcluded && !savedInfo.resultSentBefore)
                )
                  return;
                if (dataAttribs.response.length === undefined)
                  throw new Error(`["${jsonFileName}" >> "${key}"]\nAll 'response' nested properties must be enclosed as array.`);
                if (skipToNode[returnedResponse] === undefined) skipToNode[returnedResponse] = {};
                const isFirstTime = skipToNode[returnedResponse][savedInfo.responseId] === undefined;
                if (isFirstTime) updateNextResponseNode(returnedResponse, savedInfo.responseId, 0, 0);
                const { parentResponseNodeLevel, returnedResponseValueNodeLevel } = getNextResponseNode(returnedResponse, isFirstTime);
                if (contextManager.allReturnedResponseExcluded || returnedResponseValueNodeLevel === undefined) return;
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
                      contextManager.allReturnedResponseExcluded = undefined;

                      let hasPreviousPendingSequence = false;
                      const nestedNodesFixedLength = nestedNodes.length - 1;
                      for (let i = nestedNodesFixedLength; i >= 0; i--) {
                        const nestedNode = nestedNodes[i];
                        if (nestedNode.sequence) {
                          const currentSequenceId = nestedNode["*DJM_sequenceId"];
                          if (!checkIfExcluded(nestedNode).excluded) {
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
                          savedInfo.resultSentBefore = undefined;
                          savedInfo.rootNodeIndex = undefined;
                          savedInfo.lastResponseParentNode = undefined;
                          retrievedResponseNodeLevel = 0;
                          retrievedResponseValueNodeLevel = 0;
                          savedInfo.responseId = undefined;
                          savedInfo.lastReturnedResponse = undefined;
                          savedInfo.lastSequenceIsAlternate = undefined;
                          savedInfo.canFlow = undefined;
                          jsonStringKey = reloaded;
                          if (handledKey) sendMessage("recall", true);
                          else recursiveIteration(jsonStringKey, 0);
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

                  const excludedResult = checkIfExcluded(dataAttribs, isResponse);
                  contextManager.isExcluded = excludedResult.excluded;

                  if (
                    !contextManager.isExcluded &&
                    ((dataAttribs["*DJM_shown"] && sequenceProperty.exists) ||
                      (sequenceProperty.exists &&
                        (sequenceProperty.parentLength === 1 ||
                          ((alternateProperty.exists || excludedResult.nodeHasOnProp) &&
                            sequenceProperty.parentLength === 2 + (excludedResult.nodeHasOnProp ? 1 : 0)))))
                  ) {
                    dataAttribs["*DJM_shown"] = true;
                    let isExcludedSequence = false;
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
                        if (!hasSkipNodeDefinition && checkIfExcluded(dataAttribs.sequence[i]).excluded)
                          dataAttribs.sequence[i]["*DJM_skipped"] = isExcludedSequence = true;
                        else if (hasSkipNodeDefinition && i < skipToNode[currentSequenceId].sequenceNodeLevel)
                          dataAttribs.sequence[i]["*DJM_skipped"] = true;
                      } else if (checkIfExcluded(dataAttribs.sequence[i]).excluded) dataAttribs.sequence[i]["*DJM_skipped"] = true;
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
                    if (isExcludedSequence) updateNextSequenceNode(currentSequenceId, dataIndex);
                    if (!savedInfo.responseHasPendingAlternateFromParent) nestedNodes[nestedNodes.length] = dataAttribs;
                    recursiveIteration(dataAttribs.sequence, dataIndex, undefined, undefined, undefined, true);
                    return;
                  }

                  if (!dataAttribs["*DJM_shown"]) {
                    if (!contextManager.isExcluded) {
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
                        if (savedInfo.resultObject.isSequence) nestedNodes[nestedNodes.length - 1]["*DJM_hasPendingResponse"] = true;
                        sendMessage("result");
                        return;
                      }
                    }
                    let hasPendingSequence = false;
                    let returnedResponseValueNodeHasFinished = false;
                    if (!contextManager.isExcluded || (contextManager.isExcluded && (isSequence || isResponse))) {
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
                    }

                    const returnedResponseFinished = returnedResponseValueNodeHasFinished && !hasPendingSequence;
                    if (jsonStringKey[0]["*DJM_finished"] || jsonStringKey[0]["*DJM_skipped"] || returnedResponseFinished)
                      jsonStringKey.shift();
                    if (returnedResponseFinished) savedInfo.responseId = undefined;
                    savedInfo.responseHasPendingAlternateFromParent = undefined;
                    retrievedResponseNodeLevel = 0;
                    retrievedResponseValueNodeLevel = 0;
                    nestedNodes.length = 0;
                    savedInfo.allNodesExcluded = contextManager.isExcluded && !savedInfo.resultSentBefore;
                    if (jsonStringKey.length === 0) {
                      savedInfo.resultSentBefore = undefined;
                      savedInfo.rootNodeIndex = undefined;
                      savedInfo.responseId = undefined;
                      savedInfo.lastResponseParentNode = undefined;
                      savedInfo.lastSequenceIsAlternate = undefined;
                      if (reloaded) {
                        jsonStringKey = reloaded;
                        reloaded = undefined;
                        if (!contextManager.isExcluded) sendMessage("result");
                        else if (!savedInfo.allNodesExcluded) recursiveIteration(jsonStringKey, 0);
                      } else if (!contextManager.isExcluded) sendMessage("result", handledKey);
                      else if (!savedInfo.allNodesExcluded) sendMessage("recall", handledKey);
                      if (savedInfo.allNodesExcluded) throw new Error(`["${jsonFileName}" >> "${key}"]\nDo not exclude all nodes!`);
                      return;
                    }
                    if (!contextManager.isExcluded) sendMessage("result");
                    else recursiveIteration(jsonStringKey, 0);
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
  const _Run = async (key = "", { response = "", replaceTemplate, excludeTemplate, mergeTemplate, lock = false, reset = false } = {}) => {
    let originalResolve;
    let originalReject;
    let mergeTemplateInstance = mergeTemplateManager[key];
    if (mergeTemplate && (mergeTemplateInstance === undefined || reset)) {
      mergeTemplateManager[key] = {};
      mergeTemplateManager[key].lastKeyIndex = -1;
      mergeTemplateManager[key].swappedKey = key;
      mergeTemplateManager[key].pendingReset = reset;
      mergeTemplateInstance = mergeTemplateManager[key];
    }
    const mainKey = key;
    let handlingExcluded;
    async function sendMessage(keyInstance) {
      if (pendingJsonStringKeyUpdate[key]) {
        if (!reset) keyInstance.jsonStringKey = jsonString[key];
        pendingJsonStringKeyUpdate[key] = undefined;
      }
      mainWorker.postMessage(
        keyInstance === undefined
          ? {
              key,
              jsonFileName: jsonFullFileName,
              jsonStringLoaded: jsonString !== "",
              jsonStringKey: jsonString[key],
              handledKey: (response === "" && mergeTemplate !== undefined) || (response !== "" && mergeTemplateInstance !== undefined),
              response,
              excludeTemplate,
              canAppendResponses
            }
          : {
              key,
              instance: keyInstance,
              handledKey: (response === "" && mergeTemplate !== undefined) || (response !== "" && mergeTemplateInstance !== undefined),
              response,
              excludeTemplate,
              canAppendResponses
            }
      );
    }
    async function reloadRecall(reloaded) {
      instanceManager[key].jsonStringKey = reloaded;
      if (mergeTemplateInstance) mergeTemplateManager[mainKey].jsonStringKeyDone = true;
      start();
    }
    async function updateKeyInstance(args) {
      const { nextKey, mainKeyManager, mainKeyRepeated } = args;
      if (mainKeyRepeated) originalReject(`The main key must not be included in the "Merge Template"`);
      key = nextKey;
      mergeTemplateManager[mainKey] = mainKeyManager;
      keyInstance = !mergeTemplateManager[mainKey].pendingReset
        ? instanceManager[key]
        : (pendingJsonStringKeyUpdate[key] = undefined) || undefined;
      if (keyInstance) {
        const { lastUpdatedKey } = mainKeyManager;
        if (mainKeyManager.canUpdateJsonString) {
          if (canRefresh)
            await _LoadJSONFileAsync(jsonFilePath, reloadedJsonString => {
              instanceManager[key].jsonStringKey = reloadedJsonString[key];
              keyInstance = instanceManager[key];
            });
          else {
            instanceManager[key].jsonStringKey = jsonString[key];
            keyInstance = instanceManager[key];
          }
          mergeTemplateManager[mainKey].canUpdateJsonString = undefined;
        } else if (lastUpdatedKey && key !== lastUpdatedKey) {
          instanceManager[key].jsonStringKey = jsonString[key];
          keyInstance = instanceManager[key];
        }
        mergeTemplateManager[mainKey].lastUpdatedKey = key;
        pendingJsonStringKeyUpdate[key] = undefined;
      }
      return keyInstance;
    }
    async function start() {
      function sendResult(result) {
        if (replaceTemplate) {
          if (!isReplaceOnWorker) originalResolve(replaceTemplate ? replace(result, replaceTemplate) : result);
          else {
            replaceWorker.postMessage([result, replaceTemplate]);
            replaceWorker.onmessage = e => originalResolve(e.data);
          }
        } else originalResolve(result);
      }
      return new Promise(async (resolve, reject) => {
        originalResolve = originalResolve || resolve;
        originalReject = originalReject || reject;
        if (jsonString === "") originalReject(`First load "DJM._LoadJSONFileAsync()"`);
        let keyInstance;
        if (mergeTemplateInstance) key = mergeTemplateInstance.swappedKey;
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
              sendResult(keyInstance.savedInfo.requiredResult);
              return;
            }
          if (keyInstance.canPrepareReloaded) instanceManager[key].reloaded = jsonString[key];
          else instanceManager[key].reloaded = undefined;
          if (mergeTemplate && response === "" && mergeTemplateManager[mainKey].jsonStringKeyDone) {
            if (!isMergeOnWorker) sendMessage(await updateKeyInstance(keySwapper(mainKey, mergeTemplate, mergeTemplateManager[mainKey])));
            else {
              keySwapperWorker.postMessage([mainKey, mergeTemplate, mergeTemplateManager[mainKey]]);
              keySwapperWorker.onmessage = async e => sendMessage(await updateKeyInstance(e.data));
            }
            mergeTemplateManager[mainKey].jsonStringKeyDone = undefined;
          } else sendMessage(keyInstance);
        } else sendMessage();
        mainWorker.onmessage = e => {
          const { type, data, swapKey } = e.data;
          if (type === "result") {
            const { resultObject } = data.savedInfo;
            const jsonStringKeyLength = data.jsonStringKey.length;
            let reloadedPrepared;
            if (resultObject.isRepeatResponse) {
              instanceManagerHandler[key] = {};
              if (canAppendResponses) data.savedInfo.resultObject.responses = instanceManager[key].savedInfo.resultObject.responses;
              instanceManagerHandler[key] = data;
              if (!mergeTemplateInstance) {
                reloadedPrepared = instanceManagerHandler[key].canPrepareReloaded && instanceManagerHandler[key].reloaded;
                instanceManagerHandler[key].canPrepareReloaded = jsonStringKeyLength === 1;
              }
            } else {
              instanceManager[key] = data;
              if (!mergeTemplateInstance) {
                reloadedPrepared = instanceManager[key].canPrepareReloaded && instanceManager[key].reloaded;
                instanceManager[key].canPrepareReloaded = jsonStringKeyLength === 1;
              } else pendingJsonStringKeyUpdate[key] = swapKey;
            }
            if (mergeTemplateInstance) mergeTemplateManager[mainKey].jsonStringKeyDone = swapKey;
            else if (!reloadedPrepared && jsonStringKeyLength <= 1 && canRefresh) {
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
            sendResult(resultObject);
          } else if (type === "recall") {
            instanceManager[key] = data;
            if (swapKey) {
              mergeTemplateManager[mainKey].jsonStringKeyDone = pendingJsonStringKeyUpdate[key] = true;
              start();
            } else if (canRefresh) _LoadJSONFileAsync(jsonFilePath, reloadedJsonString => reloadRecall(reloadedJsonString[key]));
            else reloadRecall(jsonString[key]);
          } else if (type === "exception") {
            const { resultObject, allNodesExcluded } = data.savedInfo;
            instanceManager[key] = data;
            const allExcluded = mergeTemplateInstance && allNodesExcluded && mergeTemplateManager[mainKey].lastKeyIndex === -1;
            if (!mergeTemplateInstance || !allNodesExcluded || (allExcluded && handlingExcluded)) originalReject(resultObject);
            else {
              if (allExcluded) handlingExcluded = true;
              mergeTemplateManager[mainKey].jsonStringKeyDone = true;
              start();
            }
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
  return {
    _LoadJSONFileAsync,
    _Run,
    _RunDebounced: applyDebounce(_Run),
    _Settings,
    _TemplateGenerator,
    _IsJSONFileLoaded: (() => jsonString !== "")()
  };
})();
