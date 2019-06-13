# Dynamic-JSON-Messages (DJM)

Dynamic-JSON-Messges (DJM) by Edwyn Amador

In simple terms DJM reads a JSON file retrieving a node per run (from the first to the last one and repeating) in a dynamic way.

> In other words you'll be able to define a sequence of nodes/subnodes on a JSON file and dynamically retrieve defined messages from those nodes.

DJM can retrieve a simple sequence of nodes but also supports response nodes allowing to the user to interact with. These and other DJM features are described in the starting guide below.

Starting Guide
------
  
#### Loading the JSON file
  
```javascript
DJM._LoadJSONFileAsync("../files/some_JSON_file.json");
```
```javascript
DJM._LoadJSONFileAsync("https://www.your-domain.com/some_JSON_file.json");
``` 
  
#### JSON file node herence properties / special properties
  
- "**response**": This herence property defines a nested response node.
> Response subnodes are skippable by default. When requested, they're shown on an alternate way on
  the next cycles, this means before reloading/reading again the JSON file whether applies, and
  restarting from the first node, whether exists multiple response subnodes.
```javascript
{ ... "response": [{ "some_value": [{ ... }], "some_other_value": [{ ... }, { ... }, { ... }] }] }
```
- "**sequence**": This herence property defines nested sequence nodes.
> Sequence subnodes are shown in the given order by default.
```javascript
{ ... "sequence": [{ ... }, { ... }] }
```
- "__*alternate__": This special property works together with a "sequence" node, alternating its nested nodes.
> Supports values as: 0 / "0" / false / 1 / "1" / true
```javascript
{ ... "sequence": [{ ... }, { ... }], "*alternate": 1 }
```
- "__*required__": This special property works together with a "response" node, defining whether a response is obligatory.
> Supports values as: 0 / "0" / false / 1 / "1" / true, repeating the same response node on every
  attempt to skip, also supports a single node to return as well, this way you can define a custom
  message when attempting to skip.
```javascript
{ ... "response": [{ ... }], "*required": 1 }
{ ... "response": [{ ... }], "*required": { ... "message": "* This is required" } }
```
- "__*repeatResponse__": This special property works together with a "response" node, defininig whether a response can be repeated.
> By default response subnodes are shown once per cycle, this special property enables to show the response
  subnode on every request, this also makes possible to change the given response after sending one already.
  Supports values as: 0 / "0" / false / 1 / "1" / true
  ```javascript
 { ... "response": [{ "some_value": [{ ... }], "some_other_value": [{ ... }] }], "*repeatResponse": 1 }
 ```

#### Templates
  
- Replace Template: This template makes possible to programmatically replace any text on the result node object.
```javascript
const replaceTemplate = {
  onProp: "some_property",
  replace: [{ here: "[some_tag]", to: "foobar" }, { here: "month_day", to: new Date().getUTCDate() }, { ... }]
};
```  
> You can also generate this template by using the "_TemplateGenerator" property functions as well as its shown below.
```javascript
const r = DJM._TemplateGenerator._Replace("some_property");
r._AddReplace("[some_tag]", "foobar");
r._AddReplace("month_day", new Date().getUTCDate());
// Now you can just pass the "r._GetTemplate()" function to the "replaceTemplate" argument on the "_Run" function.
```
- Exclude Template: This template makes possible to programmatically exclude any node that matches a specific value.
  (Optional "active" property supports values as: 0 / "0" / false / 1 / "1" / true)
```javascript
const excludeTemplate = {
  onProp: "some_property",
  exclude: [{ match: "some_value" }, { match: "exclude_weekend", active: !(new Date().getDay() % 6) }, { ... }]
};
```
> You can also generate this template by using the "_TemplateGenerator" property functions as well as its shown below.  
```javascript
const e = DJM._TemplateGenerator._Exclude("some_property");
e._AddExclude("some_value");
e._AddExclude("exclude_weekend", !(new Date().getDay() % 6));
// Now you can just pass the "e._GetTemplate()" function to the "excludeTemplate" argument on the "_Run" function.
```
- Merge Template: This template makes possible to programmatically merge multiple JSON keys node definitions as one.
                  (Optional "active" property supports values as: 0 / "0" / false / 1 / "1" / true, the defined JSON keys
                  are swapped after reloading the JSON file whether applies and before restarting it from the first node)
```javascript
const mergeTemplate = {
  merge: [{ key: "another_JSON_key" }, { key: "conditional_JSON_key", active: new Date().getHours() < 12 }, { ... }]
};
```  
> You can also generate this template by using the "_TemplateGenerator" property functions as well as its shown below.
```javascript
const m = DJM._TemplateGenerator._Merge();
m._AddKey("another_JSON_key");
m._AddKey("conditional_JSON_key", new Date().getHours() < 12);
// Now you can just pass the "m._GetTemplate()" function to the "mergeTemplate" argument on the "_Run" function.
```
  
#### DJM Settings arguments
  
- "**isRefreshable**" (default = true): Specifies whether can refresh data from the JSON file before restarting it from the first node. (boolean)
- "**appendResponses**" (default = false): Specifies whether to append an array of all available responses to the retrieved node. (boolean)
- "**replaceOnWorker**" (default = false): Specifies whether to apply the replace template on a separate worker instead of the main thread. (boolean)
- "**mergeOnWorker**" (default = false): Specifies whether to apply the merge template on a separate worker instead of the main thread. (boolean)
  
#### DJM Settings sample
  
```javascript
DJM._Settings({ isRefreshable: false, appendResponses: true });
```
  
#### DJM Run arguments
  
- "**key**": The JSON key to retrieve from. (string)
- "**response**" (optional): The desired response to go through its nested nodes. (string)
- "**replaceTemplate**" (optional): The replace template. (object)
- "**excludeTemplate**" (optional): The exclude template. (object)
- "**mergeTemplate**" (optional): The merge template. (object)
- "**lock**" (default = false): When enabled locks the returned node by holding the same for next runs as long as it keeps enabled. (boolean)
- "**reset**" (default = false): When enabled forces to immediately reset from the first node. (boolean)
  
#### DJM Run samples
  
```javascript
DJM._Run("some_JSON_key").then(result => console.log(result));

DJM._Run("some_JSON_key", { excludeTemplate: e._GetTemplate() })
  .then(result => foo(result))
  .catch(error => console.log(error));
  
DJM._Run("some_JSON_key", { replaceTemplate, excludeTemplate })
  .then(result => foo(result))
  .catch(error => console.log(error));
  
DJM._Run("some_JSON_key", { response: "some_value", replaceTemplate, excludeTemplate })
  .then(result => foo(result))
  .catch(error => console.log(error));
  
DJM._Run("some_JSON_key", { replaceTemplate, excludeTemplate, mergeTemplate })
  .then(result => foo(result))
  .catch(error => console.log(error));
```
  
#### Result object
  
> The following informative properties are automatically appended on the returned object.
  
- "**hasSequence**": Appended whether the result node has a "sequence" herence property. (boolean)
- "**hasResponse**": Appended whether the result node has a "response" herence property. (boolean)
- "**hasRequired**": Appended whether the result node has a "*required" special property and is enabled. (bool)
- "**hasAlternate**": Appended whether the result node has the "*alternate" special property and is enabled. (boolean)
- "**hasRepeatResponse**": Appended whether the result node has a "*repeatResponse" special property and is enabled. (boolean)
- "**isSequence**": Appended whether the result node comes from a "sequence" node. (boolean)
- "**isResponse**": Appended whether the result node comes from a "response" node. (boolean)
- "**isRequired**": Appended whether the result node comes from a "response" node which has an enabled "*required" special property and attempted to skip. (boolean)
- "**isAlternate**": Appended whether the result node comes from a "sequence" node which has an enabled "*alternate" special property. (boolean)
- "**isRepeatResponse**": Appended whether the result comes from a "response" node node which has an enabled "*repeatResponse" special property. (boolean)
- "**responses**": Appends an array of all available responses whether the result node has a "response" subnode. (array)
               (Note: Requires "appendResponses" to be enabled on "_Settings" function)
- "**response**": Appends the given response whether the result node comes from a "response" node. (string)
  
#### JSON file node definitions + run samples
```JSON
{
  "simpleAlternate": [
    {
      "sequence": [
        { "message": "I" },
        { "message": "Hate" },
        { "message": "When" },
        { "message": "I'm" },
        { "message": "Being" },
        { "message": "Interrupted" }
      ],
      "*alternate": 1
    },
    { "message": "Blah!" }
  ]
}
```
```javascript
const button = document.querySelector("button");
button.addEventListener("click", event => {
  DJM._Run("simpleAlternate").then(result => console.log(result.message));
});
```
___
```JSON
{
  "simpleFlowAndAlternate": [
    { "message": "10" },
    { "message": "9" },
    { "message": "8" },
    { "message": "7" },
    { "message": "6" },
    { "message": "5" },
    { "message": "4" },
    { "message": "3" },
    { "message": "2" },
    { "message": "1", "sequence": [{ "message": "Merry Christmas for y'all!" }, { "message": "Happy new year!" }], "*alternate": 1 }
  ]
}
```
```javascript
const button = document.querySelector("button");
button.addEventListener("click", event => {
  DJM._Run("simpleFlowAndAlternate").then(result => console.log(result.message));
});
```
___
```JSON
{
  "dummyFooBarStory": [
    {
      "message": "Do you have your ID with you?",
      "response": [
        { "yep": [{ "message": "Just let me see it", "sequence": [{ "message": "Perfect [name], welcome to the BAR" }] }] },
        { "nope": [{ "message": "Sorry, i can't let you in" }] }
      ],
      "*required": { "message": "Please answer me first" }
    },
    { "message": "Narrator: For good or for bad this is how the story ends" }
  ]
}
```
```javascript
const sequentialFuncsToResolve = funcs => {
  // https://bit.ly/2Z6n3Nv
  funcs.reduce(
    (promise, func) => promise.then(results => Promise.resolve(func()).then(result => [...results, result])),
    Promise.resolve([])
  );
};
const replaceTemplate = {
  onProp: "message",
  replace: [{ here: "[name]", to: "FOO" }]
};
sequentialFuncsToResolve([
  () => DJM._Run("dummyFooBarStory").then(result => alert(result.message)),
  () => DJM._Run("dummyFooBarStory").then(result => alert(result.message)), // Trying to skip response
  () => DJM._Run("dummyFooBarStory", { response: "nope" }).then(result => alert(result.message)),
  () => DJM._Run("dummyFooBarStory").then(result => alert(result.message)),
  () => DJM._Run("dummyFooBarStory").then(result => alert(result.message)), // Trying again on the next day...
  () => DJM._Run("dummyFooBarStory", { response: "yep" }).then(result => alert(result.message)),
  () => DJM._Run("dummyFooBarStory", { replaceTemplate }).then(result => alert(result.message)),
  () => DJM._Run("dummyFooBarStory").then(result => alert(result.message))
]);
```
___
> The samples above illustrate a quick start guide only. On real scenarios you'll be adding your
  own extra properties and logic to fit your needs, extending the functionality as you like, for
  example for creating quizzes, showing alternate and customized messages as user interacts, even
  the responses can be used without the require of a user to interact by firing some response 
  inside an algorithm logic and doing something in particular depending on the result object, etc.

#### Possibilities

> DJM helps you to create some dynamic implementation, the way you use it is completely up to your creativity.
  I coded this library to create some dynamic and user-friendly implementation for a chrome extension project I was working on.
  
> Here's a short sample on how the final result looks like:
  
  ![alt text](https://edwyn-amador.neocities.org/djm/djm-final-result-sample.gif "DJM Final Result Sample")
  
> As you may guess the above sample illustrates just one case, in reality the extension has many more node messages like this one being shown depending on some criteria and interacting with the UI.

#### Recommendations / Tips
  
  - DJM was made by strongly having the dynamic meaning on mind. This means it can be highly
    customizable to fit your needs, so, the performance depends on how you really use it.
    Normally DJM is pretty fast, it gives an efficient user experience. However, if you notice
    some kind of performance impact try not to use too much complexity on your node definitions.
  
  - If you're planning to use fixed node definitions or if you don't expect to reflect any change
    before restarting from the first node but until manually executing the "_LoadJSONFileAsync"
    function, disable the "isRefreshable" flag argument on the "_Settings" function, this way
    you'll be saving the data refresh time cost.
  
  - In some cases when many nodes are needed to be shown, it could be better to split them into
    separate JSON keys on the JSON file and merge them by using the merge template.
    Either way you can measure the performance time and decide which one works better for you.
  
  - If you find the replace template isn't fast enough for you, you could implement a simple 
    text replacement on the specific property of the returned object instead.
  
  - The "_TemplateGenerator" property functions can be really helpful in many situations
    as it doesn't require you to know/remember the template structure. However, if you'll
    be constantly generating the template because of the "active" property changing, it'll
    be better to manually store the template structure in a variable and just be updating it.
    This way the template structure maintains fixed while the "active" property can be
    constantly changing. This approach ends up by slightly having a better performance.
  
  - By default the replace and merge template are both applied on the main thread (specified
    by the flag arguments "replaceOnWorker" and "mergeOnWorker" on the "_Settings" function).
    This is because it performs faster on the main thread than on a separate web worker due
    to its execution time cost. However, this isn't that noticable either, so by having the
    option to decide how to apply these templates and by leaving the main thread as default
    it's more like a micro-optimization. That being said, it may be better to only change
    this if you'll be running some code on the main thread at the same time as DJM and
    notice some kind of lag or UI freezing, otherwise just leave it as defaults.
  
  - To ensure you're not having any possible conflict with some internal reserved property, 
    just make sure to not define any property starting with "*DJM" on the JSON file, other
    than that you're free to define your own properties as you like.
  
  - This is the complete version of DJM. There exists two more versions (balanced and essential),
    balanced version doesn't have replace and merge template functionality support, while in the
    other hand essential version doesn't have the previously mentioned plus doesn't have exclude
    template and debounce functionality support, in case you're strictly looking for even better
    performance and/or a smaller file size (and compiled/minified version isn't enough), you
    could check them out and decide which one is enough for your needs.
  
*</ You're now ready to give it a try. Happy Coding! - Ed >*
