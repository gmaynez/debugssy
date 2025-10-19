// Example JavaScript file for testing debugging
function fibonacci(n) {
    if (n <= 1) {
        return n;
    }
    return fibonacci(n - 1) + fibonacci(n - 2);
}

function main() {
    const numbers = [5, 10, 15];
    
    for (const num of numbers) {
        const result = fibonacci(num);
        console.log(`Fibonacci(${num}) = ${result}`);
    }
    
    // Test variable inspection
    const person = {
        name: "John Doe",
        age: 30,
        hobbies: ["reading", "coding", "gaming"]
    };
    
    console.log("Person:", person);
}

main();

