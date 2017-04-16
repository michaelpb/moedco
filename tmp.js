| onclick
| Fires when the [[pointing device]] button is clicked over an element. A click is defined as a mousedown and mouseup over the same screen location. The sequence of these events is:
* mousedown
* mouseup
* click
| Yes
| Yes
|-
| dblclick
| ondblclick
| Fires when the pointing device button is [[double-click]]ed over an element
| Yes
| Yes
|-
| mousedown
| onmousedown
| Fires when the pointing device button is pressed over an element
| Yes
| Yes
|-
| mouseup
| onmouseup
| Fires when the pointing device button is released over an element
| Yes
| Yes
|-
| [[mouseover]]
| onmouseover
| Fires when the pointing device is moved onto an element
| Yes
| Yes
|-
| mousemove
| onmousemove
| Fires when the pointing device is moved while it is over an element
| Yes
| No
|-
| mouseout
| onmouseout
| Fires when the pointing device is moved away from an element
| Yes
| Yes
|-
| dragstart
| ondragstart
| Fired on an element when a drag is started.
| Yes
| Yes
|-
| drag
| ondrag
| This event is fired at the source of the drag, that is, the element where dragstart was fired, during the drag operation.
| Yes
| Yes
|-
| dragenter
| ondragenter
| Fired when the mouse is first moved over an element while a drag is occurring.
| Yes
| Yes
|-
| dragleave
| ondragleave
| This event is fired when the mouse leaves an element while a drag is occurring.
| Yes
| No
|-
| dragover
| ondragover
| This event is fired as the mouse is moved over an element when a drag is occurring.
| Yes
| Yes
|-
| drop
| ondrop
| The drop event is fired on the element where the drop occurs at the end of the drag operation.
| Yes
| Yes
|-
| dragend
| ondragend
| The source of the drag will receive a dragend event when the drag operation is complete, whether it was successful or not.
| Yes
| No
|-
| rowspan=3 | Keyboard
| keydown
| onkeydown
| Fires before keypress, when a key on the keyboard is pressed.
| Yes
| Yes
|-
| keypress
| onkeypress
| Fires after keydown, when a key on the keyboard is pressed. 
| Yes
| Yes
|-
| keyup
| onkeyup
| Fires when a key on the keyboard is released
| Yes
| Yes
|-
| rowspan=6 | [[Framing (World Wide Web)|HTML frame]]/object
| load
| onload
| Fires when the [[user agent]] finishes loading all content within a document, including window, frames, objects and images
For elements, it fires when the target element and all of its content has finished loading
| No
| No
|-
| unload
| onunload
| Fires when the user agent removes all content from a window or frame
For elements, it fires when the target element or any of its content has been removed
| No
| No
|-
| abort
| onabort
| Fires when an object/image is stopped from loading before completely loaded
| Yes
| No
|-
| error
| onerror
| Fires when an object/image/frame cannot be loaded properly
| Yes
| No
|-
| resize
| onresize
| Fires when a document view is resized
| Yes
| No
|-
| scroll
| onscroll
| Fires when an element or document view is scrolled
| No, except that a scroll event on document must bubble to the window<ref>{{cite web
 |url=http://www.w3.org/TR/DOM-Level-3-Events/
 |title= Document Object Model (DOM) Level 3 Events Specification (working draft)
 |publisher= [[W3C]]
 |accessdate=2013-04-17}}</ref>
| No
|-
| rowspan=6 | [[Form (HTML)|HTML form]]
| select
| onselect
| Fires when a user selects some text in a [[Text box|text field]], including input and textarea
| Yes
| No
|-
| change
| onchange
| Fires when a control loses the input [[Focus (computing)|focus]] and its value has been modified since gaining focus
| Yes
| No
|-
| submit
| onsubmit
| Fires when a form is submitted
| Yes
| Yes
|-
| reset
| onreset
| Fires when a form is reset
| Yes
| No
|-
| focus
| onfocus
| Fires when an element receives focus either via the pointing device or by [[Tab order|tab navigation]]
| No
| No
|-
| blur
| onblur
| Fires when an element loses focus either via the pointing device or by [[tabbing navigation]]
| No
| No
|-
| rowspan=3 | User interface
| focusin
| (none)
| Similar to HTML focus event, but can be applied to any focusable element
| Yes
| No
|-
| focusout
| (none)
| Similar to HTML blur event, but can be applied to any focusable element
| Yes
| No
|-
| DOMActivate
| (none)
| Similar to XUL command event. Fires when an element is activated, for instance, through a mouse click or a keypress.
| Yes
| Yes
|-
| rowspan=7 | Mutation
| DOMSubtreeModified
| (none)
| Fires when the subtree is modified
| Yes
| No
|-
| DOMNodeInserted
| (none)
| Fires when a node has been added as a child of another node
| Yes
| No
|-
| DOMNodeRemoved
| (none)
| Fires when a node has been removed from a DOM-tree
| Yes
| No
|-
| DOMNodeRemovedFromDocument
| (none)
| Fires when a node is being removed from a document
| No
| No
|-
| DOMNodeInsertedIntoDocument
| (none)
| Fires when a node is being inserted into a document
| No
| No
|-
| DOMAttrModified
| (none)
| Fires when an attribute has been modified
| Yes
| No
|-
| DOMCharacterDataModified
| (none)
| Fires when the character data has been modified
| Yes
| No
|-
| rowspan=6 | Progress
| loadstart
| (none)
| Progress has begun.
| No
| No
|-
| progress
| (none)
| In progress. After loadstart has been dispatched.
| No
| No
|-
| error
| (none)
| Progression failed. After the last progress has been dispatched, or after loadstart has been dispatched if progress has not been dispatched.
| No
| No
|-
| abort
| (none)
| Progression is terminated. After the last progress has been dispatched, or after loadstart has been dispatched if progress has not been dispatched.
| No
| No
|-
| load
| (none)
| Progression is successful. After the last progress has been dispatched, or after loadstart has been dispatched if progress has not been dispatched.
| No
| No
|-
| loadend
| (none)
| Progress has stopped. After one of error, abort, or load has been dispatched.
| No
| No
|-
|}

Note that the events whose names start with “DOM” are currently not well supported, and for this and other performance reasons are deprecated by the W3C in DOM Level 3. [[Mozilla]] and [[Opera (web browser)|Opera]] support DOMAttrModified, DOMNodeInserted, DOMNodeRemoved and DOMCharacterDataModified. [[Google Chrome|Chrome]] and [[Safari (web browser)|Safari]] support these events, except for DOMAttrModified.

==== Touch events ====
Web browsers running on [[Touchscreen|touch-enabled]] devices, such as Apple's [[IOS (Apple)|iOS]] and Google's [[Android (operating system)|Android]], generate additional events.<ref name="w3c_v2"/>{{rp|§5.3}}
{| class="wikitable"
! Category
! Type
! Attribute
! Description
! Bubbles
! Cancelable
|-
| rowspan=6 | Touch
| touchstart
| 
| Fires when a finger is placed on the touch surface/screen.
| Yes
| Yes
|-
| touchend
| 
| Fires when a finger is removed from the touch surface/screen.
| Yes
| Yes
|-
| touchmove
| 
| Fires when a finger already placed on the screen is moved across the screen.
| Yes
| Yes
|-
| touchenter
| 
| Fires when a touch point moves onto the interactive area defined by a DOM element.
| Yes
| Yes
|-
| touchleave
| 
| Fires when a touch point moves off the interactive area defined by a DOM element.
| Yes
| Yes
|-
| touchcancel
| 
| A [[user agent]] must dispatch this event type to indicate when a TouchPoint has been disrupted in an implementation-specific manner, such as by moving outside the bounds of the UA window. A user agent may also dispatch this event type when the user places more touch points (The coordinate point at which a pointer (e.g. finger or stylus) intersects the target surface of an interface)  on the touch surface than the device or implementation is configured to store, in which case the earliest TouchPoint object in the TouchList should be removed.<ref name="w3c_v2"/>{{rp|§5.9}}
| Yes
| No
|-
|}

In the [[W3C]] draft recommendation, a <code>TouchEvent</code> delivers a <code>TouchList</code> of <code>Touch</code> locations, the [[modifier key]]s that were active, a <code>TouchList</code> of <code>Touch</code> locations within the targeted DOM element, and a <code>TouchList</code> of <code>Touch</code> locations that have changed since the previous <code>TouchEvent</code>.<ref name="w3c_v2">{{cite web|title=Touch Events version 2 - W3C Editor's Draft|url=http://dvcs.w3.org/hg/webevents/raw-file/tip/touchevents.html|publisher=W3C|accessdate=10 December 2011|date=14 November 2011}}</ref>

[[Apple Inc.|Apple]] didn't join this working group, and delayed W3C recommendation of its Touch Events Specification by disclosing [[software patent|patents]] late in the recommendation process.<ref name="opera">{{cite web|title=Apple using patents to undermine open standards again|url=http://my.opera.com/haavard/blog/2011/12/09/apple-w3c|publisher=opera.com|accessdate=9 December 2011|date=9 December 2011}}</ref>

==== Pointer events<ref>{{cite web|url=http://www.w3.org/TR/2013/CR-pointerevents-20130509/|title=Pointer Events|publisher=}}</ref> ====
Web browsers on devices with various types of input devices including mouse, touch panel, and pen may generate integrated input events. Users can see what type of input device is pressed, what button is pressed on that device, and how strongly the button is pressed when it comes to a stylus pen. As of October 2013, this event is only supported by Internet Explorer 10 and 11.
{| class="wikitable"
! Category
! Type
! Attribute
! Description
! Bubbles
! Cancelable
|-
| rowspan=10 | Pointer
| pointerdown
| onpointerdown
| Fires when the pointing device button is activated, or pressed over an element. 
| Yes
| Yes
|-
| pointerup
| onpointerup
| Fires when the pointing device button is released over an element
| Yes
| Yes
|-
| pointercancel
| onpointercancel
| Fires when a pointing device is unlikely to continue to produce event because, for example, the device is used for panning/zooming after a pointerdown event.
| Yes
| Yes
|-
| pointermove
| onpointermove
| Fires when the pointing device is moved while it is over an element 
| Yes
| Yes
|-
| pointerover
| onpointerover
| Fires when the pointing device is moved onto an element
| Yes
| Yes
|-
| pointerout
| onpointerout
| Fires when the pointing device is moved away from an element. Also fires after pointerup by pointing device without hovering, or after 
| Yes
| Yes
|-
| pointerenter
| onpointerenter
| Fires when the pointing device is moved onto an element, or when the button of the pointing device which does not support hovering is pressed on one of its descendant elements.
| No
| Yes
|-
| pointerleave
| onpointerleave
| Fires when the pointing device is moved away from an element, or when the button of the pointing device which does not support hovering is released over its descendant elements.
| No
| Yes
|-
| gotpointercapture
| ongotpointercapture
| Fires when the pointer is captured by setPointerCapture method.
| Yes
| No
|-
| lostpointercapture
| onlostpointercapture
| Fires when the pointer is released by releasePointerCapture method.
| Yes
| No
|-
|}

==== Indie UI events<ref>{{cite web|url=http://www.w3.org/TR/indie-ui-events/|title=IndieUI: Events 1.0|publisher=}}</ref> ====
Not yet really implemented, the Indie UI working groups want to help web application developers to be able to support standard user interaction events without having to handle different platform specific technical events that could match with it.

Scripting usable interfaces can be difficult, especially when one considers that user interface design patterns differ across software platforms, hardware, and locales, and that those interactions can be further customized based on personal preference. Individuals are accustomed to the way the interface works on their own system, and their preferred interface frequently differs from that of the web application author's preferred interface.

For example, web application authors, wishing to intercept a user's intent to 'undo' the last action, need to "listen" for all the following events:
* control+z on Windows and Linux.
* command+z on Mac OS X.
* Shake events on some mobile devices.

It would be simpler to listen for a single, normalized request to 'undo' the previous action.

{| class="wikitable"
! Category
! Type
! Description
! Bubbles
! Cancelable
|-
| rowspan=6 | Request
| undorequest
| Indicates the user desires to 'undo' the previous action. (May be superseded by the UndoManager interface.)
| Yes
| Yes
|-
| redorequest
| Indicates the user desires to 'redo' the previously 'undone' action. (May be superseded by the UndoManager interface.)
| Yes
| no
|-
| expandrequest
| Indicates the user desires to reveal information in a collapsed section (e.g. a disclosure widget) or branch node in a hierarchy (e.g., a tree view).
| Yes
| Yes
