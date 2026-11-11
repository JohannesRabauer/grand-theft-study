// The texture key of a kid without the stride or pedal frame suffix (story 16.13: a moving kid shows `-wa`, `-wb`, `-ra`, `-rb` or `-pa`, `-pb`).
export const baseKey = sprite => sprite.texture.key.replace(/-(wa|wb|ra|rb|pa|pb)$/, '');
