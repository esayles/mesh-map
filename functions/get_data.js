export async function onRequest(context) {
  var responseData = {
    samples: [
      {lat: 47.7157, lon: -122.0886, edges: ["7e"]}
    ],
    repeaters:[
      {id: "7e", name: "WW7STR/PugetMesh Cougar", lat: 47.54396, lon: -122.10861}
    ]};
  return new Response(JSON.stringify(responseData));
}