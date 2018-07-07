[![Marketplace](https://vsmarketplacebadge.apphb.com/version/quicktype.quicktype.svg)](https://marketplace.visualstudio.com/items/quicktype.quicktype) [![Installs](https://vsmarketplacebadge.apphb.com/installs/quicktype.quicktype.svg)](https://marketplace.visualstudio.com/items/quicktype.quicktype) [![Ratings](https://vsmarketplacebadge.apphb.com/rating-short/quicktype.quicktype.svg)](https://marketplace.visualstudio.com/items/quicktype.quicktype)

**Supports** `TypeScript`, `Python`, `Go`, `Ruby`, `C#`, `Java`, `Swift`, `Rust`, `Kotlin`, `C++`, `Flow`, `Objective-C`, `JavaScript`, `Elm`, and `JSON Schema`.

`quicktype` infers types from sample JSON data, then outputs strongly typed models and serializers for working with that data in your desired programming language. For more explanation, read [A first look at quicktype](http://blog.quicktype.io/first-look/).

![](https://raw.githubusercontent.com/quicktype/quicktype-vscode/master/media/demo.gif)

For a more powerful experience, including custom options and the ability to generate code from JSON Schema or multiple JSON samples, try [quicktype.io](https://app.quicktype.io).

## Installing

This extension is available for free in the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items/quicktype.quicktype)

## Example

Let's generate some Go code to parse this Pokémon JSON:

```json
{
    "id": 1,
    "name": "Bulbasaur",
    "img": "http://www.serebii.net/pokemongo/pokemon/001.png",
    "type": ["Grass", "Poison"],
    "weaknesses": ["Fire", "Ice", "Flying", "Psychic"]
}
```

1.  Copy this sample JSON.
1.  Create a new `.go` file.
1.  Invoke the `Paste JSON as Code` command (or `Paste JSON as Types` if you only want types).
1.  Type a name for this type–`Pokemon` will do.

`quicktype` will generate the following code:

```go
package main

import "encoding/json"

func UnmarshalPokemon(data []byte) (Pokemon, error) {
	var r Pokemon
	err := json.Unmarshal(data, &r)
	return r, err
}

func (r *Pokemon) Marshal() ([]byte, error) {
	return json.Marshal(r)
}

type Pokemon struct {
	ID         int64    `json:"id"`
	Name       string   `json:"name"`
	Img        string   `json:"img"`
	Type       []string `json:"type"`
	Weaknesses []string `json:"weaknesses"`
}
```
