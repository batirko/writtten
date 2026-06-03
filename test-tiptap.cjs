const { JSDOM } = require("jsdom");
const dom = new JSDOM('<!DOCTYPE html><div id="editor"></div>');
global.document = dom.window.document;
global.window = dom.window;
global.HTMLElement = dom.window.HTMLElement;
global.navigator = dom.window.navigator;

const { Editor } = require("@tiptap/core");
const StarterKit = require("@tiptap/starter-kit").default;
const { Markdown } = require("tiptap-markdown");

const editor = new Editor({
  element: document.querySelector("#editor"),
  extensions: [StarterKit, Markdown],
  content: "### Initial"
});

editor.commands.setContent("### Background\n\nBody text", true);
console.log("setContent output:", JSON.stringify(editor.getJSON(), null, 2));

// Simulate paste
const { PluginKey } = require("@tiptap/pm/state");
editor.commands.insertContent("### Goal\n\nMore body text");
console.log("insertContent output:", JSON.stringify(editor.getJSON(), null, 2));
