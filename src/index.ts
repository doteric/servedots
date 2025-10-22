console.log('hello world');

// Example usage??

// I want have this as building blocks. I want a building block for example for the request transformation to be handled by servedots from anywhere (classic nodejs, aws lambda etc.), the payload validation done by zod (by default, maybe allow other also?), the output transformation as a separate module also or as part of one that will have both input and output transformation for classic nodejs and aws lambda (for example). I also want to generate an openapi schema based on all of this making sure that the response type is inferred from the function handling the request (based on typescript return type).
